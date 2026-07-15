import { Injectable, inject, signal } from '@angular/core';
import { WebSocketService } from './websocket.service';
import { SessionService } from './session.service';

export type CallDirection = 'outgoing' | 'incoming';
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export interface CallState {
  status: CallStatus;
  direction: CallDirection | null;
  conversationId: string | null;
  remoteUserId: string | null;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

@Injectable({ providedIn: 'root' })
export class CallService {
  private readonly ws = inject(WebSocketService);
  private readonly session = inject(SessionService);

  readonly state = signal<CallState>({
    status: 'idle',
    direction: null,
    conversationId: null,
    remoteUserId: null,
  });

  readonly localStream = signal<MediaStream | null>(null);
  readonly remoteStream = signal<MediaStream | null>(null);

  private pc: RTCPeerConnection | null = null;

  resetState() {
    this.cleanup();
    this.state.set({ status: 'idle', direction: null, conversationId: null, remoteUserId: null });
  }

  subscribeCallTopics(conversationId: string) {
    this.ws.subscribeToCallOffer(conversationId, (msg) => this.handleOffer(conversationId, msg));
    this.ws.subscribeToCallAnswer(conversationId, (msg) => this.handleAnswer(msg));
    this.ws.subscribeToIceCandidate(conversationId, (msg) => this.handleIceCandidate(msg));
    this.ws.subscribeToCallEnd(conversationId, () => this.handleEnd());
  }

  unsubscribeCallTopics(conversationId: string) {
    this.ws.unsubscribeCallTopic(conversationId);
  }

  async startCall(conversationId: string, remoteUserId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      this.localStream.set(stream);

      this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      stream.getTracks().forEach((track) => this.pc!.addTrack(track, stream));

      this.pc.ontrack = (event) => {
        this.remoteStream.set(event.streams[0]);
      };

      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.ws.sendIceCandidate(conversationId, event.candidate.candidate, event.candidate.sdpMid ?? '', event.candidate.sdpMLineIndex ?? 0);
        }
      };

      this.state.set({ status: 'calling', direction: 'outgoing', conversationId, remoteUserId });

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.ws.sendCallOffer(conversationId, JSON.stringify(offer));
    } catch (e) {
      console.error('Call start error:', e);
      this.resetState();
    }
  }

  private async handleOffer(conversationId: string, msg: any) {
    try {
      const sdp = typeof msg.sdp === 'string' ? JSON.parse(msg.sdp) : msg.sdp;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      this.localStream.set(stream);

      this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      stream.getTracks().forEach((track) => this.pc!.addTrack(track, stream));

      this.pc.ontrack = (event) => {
        this.remoteStream.set(event.streams[0]);
      };

      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.ws.sendIceCandidate(conversationId, event.candidate.candidate, event.candidate.sdpMid ?? '', event.candidate.sdpMLineIndex ?? 0);
        }
      };

      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.ws.sendCallAnswer(conversationId, JSON.stringify(answer));

      this.state.set({ status: 'connected', direction: 'incoming', conversationId, remoteUserId: msg.callerId || '' });
    } catch (e) {
      console.error('Call offer handling error:', e);
    }
  }

  private async handleAnswer(msg: any) {
    if (!this.pc) return;
    try {
      const sdp = typeof msg.sdp === 'string' ? JSON.parse(msg.sdp) : msg.sdp;
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      this.state.update((s) => ({ ...s, status: 'connected' }));
    } catch (e) {
      console.error('Call answer handling error:', e);
    }
  }

  private async handleIceCandidate(msg: any) {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate({
        candidate: msg.candidate,
        sdpMid: msg.sdpMid,
        sdpMLineIndex: msg.sdpMLineIndex,
      }));
    } catch (e) {
      console.warn('ICE candidate error:', e);
    }
  }

  private handleEnd() {
    this.cleanup();
    this.state.set({ status: 'ended', direction: null, conversationId: null, remoteUserId: null });
  }

  endCall() {
    const convId = this.state().conversationId;
    if (convId) {
      this.ws.sendCallEnd(convId);
    }
    this.handleEnd();
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
  }
}
