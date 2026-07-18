import { Injectable, Injector, inject, signal } from '@angular/core';
import { WebSocketService } from './websocket.service';
import { SessionService } from './session.service';
import { ChatFacade } from './chat.facade';

export type CallDirection = 'outgoing' | 'incoming';
export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended';
export type CallKind = 'audio' | 'video';

export interface CallState {
  status: CallStatus;
  direction: CallDirection | null;
  kind: CallKind;
  conversationId: string | null;
  remoteUserId: string | null;
  remoteName: string;
  endedReason: string;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const IDLE_STATE: CallState = {
  status: 'idle',
  direction: null,
  kind: 'video',
  conversationId: null,
  remoteUserId: null,
  remoteName: '',
  endedReason: '',
};

@Injectable({ providedIn: 'root' })
export class CallService {
  private readonly ws = inject(WebSocketService);
  private readonly session = inject(SessionService);
  private readonly injector = inject(Injector);

  readonly state = signal<CallState>({ ...IDLE_STATE });
  readonly localStream = signal<MediaStream | null>(null);
  readonly remoteStream = signal<MediaStream | null>(null);
  readonly micEnabled = signal(true);
  readonly cameraEnabled = signal(true);

  private pc: RTCPeerConnection | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private pendingOffer: any = null;
  private endedTimeout: ReturnType<typeof setTimeout> | null = null;
  private ringTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly subscribedConversations = new Set<string>();

  private get myId(): string {
    return this.session.currentUser()?.id ?? '';
  }

  private resolveName(userId: string): string {
    if (!userId) return 'Unknown';
    try {
      return this.injector.get(ChatFacade).getUserDisplayName(userId);
    } catch {
      return userId.slice(0, 8);
    }
  }

  subscribeCallTopics(conversationId: string) {
    if (this.subscribedConversations.has(conversationId)) return;
    this.subscribedConversations.add(conversationId);
    this.ws.subscribeToCallOffer(conversationId, (msg) => this.handleOffer(conversationId, msg));
    this.ws.subscribeToCallAnswer(conversationId, (msg) => this.handleAnswer(msg));
    this.ws.subscribeToIceCandidate(conversationId, (msg) => this.handleIceCandidate(msg));
    this.ws.subscribeToCallEnd(conversationId, (msg) => this.handleRemoteEnd(msg));
  }

  unsubscribeCallTopics(conversationId: string) {
    if (this.state().conversationId === conversationId) return;
    this.subscribedConversations.delete(conversationId);
    this.ws.unsubscribeCallTopic(conversationId);
  }

  async startCall(conversationId: string, remoteUserId: string, remoteName: string, kind: CallKind) {
    if (this.state().status !== 'idle') return;
    this.subscribeCallTopics(conversationId);
    try {
      const stream = await this.getMedia(kind);
      this.localStream.set(stream);
      this.createPeer(conversationId, stream);

      this.state.set({
        status: 'outgoing',
        direction: 'outgoing',
        kind,
        conversationId,
        remoteUserId,
        remoteName,
        endedReason: '',
      });

      const offer = await this.pc!.createOffer();
      await this.pc!.setLocalDescription(offer);
      this.ws.sendCallOffer(conversationId, JSON.stringify({ sdp: offer, kind }), this.myId);

      this.ringTimeout = setTimeout(() => {
        if (this.state().status === 'outgoing') {
          this.endCall('No answer');
        }
      }, 45000);
    } catch (e) {
      console.error('Call start error:', e);
      this.finishCall('Camera/microphone unavailable');
    }
  }

  private async handleOffer(conversationId: string, msg: any) {
    const callerId: string = msg.callerId || '';
    if (callerId && callerId === this.myId) return;

    if (this.state().status !== 'idle') {
      this.ws.sendCallEnd(conversationId, this.myId);
      return;
    }

    let parsed: any;
    try {
      parsed = typeof msg.sdp === 'string' ? JSON.parse(msg.sdp) : msg.sdp;
    } catch {
      return;
    }
    const kind: CallKind = parsed?.kind === 'audio' ? 'audio' : 'video';
    this.pendingOffer = parsed?.sdp ?? parsed;

    this.state.set({
      status: 'incoming',
      direction: 'incoming',
      kind,
      conversationId,
      remoteUserId: callerId,
      remoteName: this.resolveName(callerId),
      endedReason: '',
    });

    this.ringTimeout = setTimeout(() => {
      if (this.state().status === 'incoming') {
        this.endCall('Missed call');
      }
    }, 45000);
  }

  async acceptCall() {
    const s = this.state();
    if (s.status !== 'incoming' || !s.conversationId || !this.pendingOffer) return;
    this.clearRingTimeout();
    try {
      const stream = await this.getMedia(s.kind);
      this.localStream.set(stream);
      this.createPeer(s.conversationId, stream);

      await this.pc!.setRemoteDescription(new RTCSessionDescription(this.pendingOffer));
      await this.drainCandidates();

      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);
      this.ws.sendCallAnswer(s.conversationId, JSON.stringify(answer), this.myId);

      this.pendingOffer = null;
      this.state.update((st) => ({ ...st, status: 'connecting' }));
    } catch (e) {
      console.error('Accept call error:', e);
      this.endCall('Failed to connect');
    }
  }

  rejectCall() {
    this.endCall('Declined');
  }

  private async handleAnswer(msg: any) {
    if (!this.pc || this.state().status !== 'outgoing') return;
    this.clearRingTimeout();
    try {
      const sdp = typeof msg.sdp === 'string' ? JSON.parse(msg.sdp) : msg.sdp;
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.drainCandidates();
      this.state.update((s) => ({ ...s, status: 'connecting' }));
    } catch (e) {
      console.error('Call answer handling error:', e);
    }
  }

  private async handleIceCandidate(msg: any) {
    if (msg.senderId && msg.senderId === this.myId) return;
    const candidate: RTCIceCandidateInit = {
      candidate: msg.candidate,
      sdpMid: msg.sdpMid,
      sdpMLineIndex: msg.sdpMLineIndex,
    };
    if (!this.pc || !this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('ICE candidate error:', e);
    }
  }

  private handleRemoteEnd(msg: any) {
    if (msg?.userId && msg.userId === this.myId) return;
    const wasRinging = this.state().status === 'incoming' || this.state().status === 'outgoing';
    this.finishCall(wasRinging ? 'Call ended' : 'Call ended');
  }

  endCall(reason = 'Call ended') {
    const convId = this.state().conversationId;
    if (convId) {
      this.ws.sendCallEnd(convId, this.myId);
    }
    this.finishCall(reason);
  }

  toggleMic() {
    const stream = this.localStream();
    if (!stream) return;
    const enabled = !this.micEnabled();
    stream.getAudioTracks().forEach((t) => (t.enabled = enabled));
    this.micEnabled.set(enabled);
  }

  toggleCamera() {
    const stream = this.localStream();
    if (!stream) return;
    const enabled = !this.cameraEnabled();
    stream.getVideoTracks().forEach((t) => (t.enabled = enabled));
    this.cameraEnabled.set(enabled);
  }

  resetState() {
    this.clearTimeouts();
    this.cleanup();
    this.pendingOffer = null;
    this.pendingCandidates = [];
    this.state.set({ ...IDLE_STATE });
  }

  private finishCall(reason: string) {
    this.clearTimeouts();
    this.cleanup();
    this.pendingOffer = null;
    this.pendingCandidates = [];
    this.state.update((s) => ({ ...IDLE_STATE, status: 'ended', endedReason: reason }));
    this.endedTimeout = setTimeout(() => {
      if (this.state().status === 'ended') {
        this.state.set({ ...IDLE_STATE });
      }
    }, 2500);
  }

  private createPeer(conversationId: string, stream: MediaStream) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    stream.getTracks().forEach((track) => this.pc!.addTrack(track, stream));

    this.pc.ontrack = (event) => {
      this.remoteStream.set(event.streams[0]);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.sendIceCandidate(
          conversationId,
          event.candidate.candidate,
          event.candidate.sdpMid ?? '',
          event.candidate.sdpMLineIndex ?? 0,
          this.myId
        );
      }
    };

    this.pc.onconnectionstatechange = () => {
      const st = this.pc?.connectionState;
      if (st === 'connected') {
        this.state.update((s) => (s.status === 'connecting' || s.status === 'outgoing' ? { ...s, status: 'connected' } : s));
      } else if (st === 'failed' || st === 'disconnected' || st === 'closed') {
        if (this.state().status === 'connected' || this.state().status === 'connecting') {
          this.finishCall('Call ended');
        }
      }
    };
  }

  private async drainCandidates() {
    if (!this.pc) return;
    const candidates = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of candidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.warn('Draining ICE error:', e);
      }
    }
  }

  private getMedia(kind: CallKind): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === 'video',
    });
  }

  private clearRingTimeout() {
    if (this.ringTimeout) {
      clearTimeout(this.ringTimeout);
      this.ringTimeout = null;
    }
  }

  private clearTimeouts() {
    this.clearRingTimeout();
    if (this.endedTimeout) {
      clearTimeout(this.endedTimeout);
      this.endedTimeout = null;
    }
  }

  private cleanup() {
    try {
      this.localStream()?.getTracks().forEach((t) => t.stop());
    } catch (_) {}
    try {
      this.remoteStream()?.getTracks().forEach((t) => t.stop());
    } catch (_) {}
    try { this.pc?.close(); } catch (_) {}
    this.pc = null;
    this.localStream.set(null);
    this.remoteStream.set(null);
    this.micEnabled.set(true);
    this.cameraEnabled.set(true);
  }
}
