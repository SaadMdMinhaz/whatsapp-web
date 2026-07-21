import { Injectable, Injector, inject, signal } from '@angular/core';
import { WebSocketService } from './websocket.service';
import { SessionService } from './session.service';
import { ChatFacade } from './chat.facade';

export type CallDirection = 'outgoing' | 'incoming';
export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended';
export type CallKind = 'audio' | 'video';

export interface ParticipantInfo {
  userId: string;
  name: string;
  stream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export interface CallState {
  status: CallStatus;
  direction: CallDirection | null;
  kind: CallKind;
  conversationId: string | null;
  remoteUserId: string | null;
  remoteName: string;
  endedReason: string;
  isGroup: boolean;
  participants: ParticipantInfo[];
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
  isGroup: false,
  participants: [],
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
  private peerConnections = new Map<string, RTCPeerConnection>();
  private remoteStreamsByPeer = new Map<string, MediaStream>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private pendingOffer: any = null;
  private pendingOfferFrom: string | null = null;
  private pendingGroupOffers = new Map<string, any>();
  private endedTimeout: ReturnType<typeof setTimeout> | null = null;
  private ringTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectionWatchdog: ReturnType<typeof setInterval> | null = null;
  private groupMemberIds: string[] = [];

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

  init() {
    this.ws.subscribeIncomingCalls((msg) => {
      switch (msg.kind) {
        case 'offer':
          this.handleOffer(msg.payload);
          break;
        case 'answer':
          this.handleAnswer(msg.payload);
          break;
        case 'iceCandidate':
          this.handleIceCandidate(msg.payload);
          break;
        case 'end':
          this.handleRemoteEnd(msg.payload);
          break;
        case 'group.join':
          this.handleGroupJoin(msg.payload);
          break;
      }
    });
  }

  async startCall(conversationId: string, remoteUserId: string, remoteName: string, kind: CallKind) {
    const status = this.state().status;
    if (status !== 'idle' && status !== 'ended') return;

    this.clearAllTimeouts();
    this.cleanup();

    try {
      const stream = await this.getMedia(kind);
      this.localStream.set(stream);
      this.createPeer(conversationId, stream, remoteUserId);

      this.state.set({
        status: 'outgoing',
        direction: 'outgoing',
        kind,
        conversationId,
        remoteUserId,
        remoteName,
        endedReason: '',
        isGroup: false,
        participants: [],
      });

      const offer = await this.pc!.createOffer();
      await this.pc!.setLocalDescription(offer);
      this.ws.sendCallOffer(conversationId, JSON.stringify({ sdp: offer, kind }), this.myId, remoteUserId);

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

  async startGroupCall(conversationId: string, memberIds: string[], kind: CallKind) {
    const status = this.state().status;
    if (status !== 'idle' && status !== 'ended') return;

    this.clearAllTimeouts();
    this.cleanup();
    this.groupMemberIds = memberIds.filter((id) => id !== this.myId);

    try {
      const stream = await this.getMedia(kind);
      this.localStream.set(stream);

      this.state.set({
        status: 'outgoing',
        direction: 'outgoing',
        kind,
        conversationId,
        remoteUserId: null,
        remoteName: '',
        endedReason: '',
        isGroup: true,
        participants: [],
      });

      for (const memberId of this.groupMemberIds) {
        if (this.shouldCreateOfferer(memberId)) {
          await this.createGroupPeer(conversationId, stream, memberId);
          const pc = this.peerConnections.get(memberId);
          if (pc) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.ws.sendCallOffer(conversationId, JSON.stringify({ sdp: offer, kind, isGroup: true }), this.myId, memberId);
          }
        }
        // If we should NOT create offerer (our ID > memberId),
        // the other side will send us an offer when they get group.join
      }

      this.ringTimeout = setTimeout(() => {
        const s = this.state();
        if (s.status === 'outgoing' && s.participants.length === 0) {
          this.endCall('No answer');
        }
      }, 45000);
    } catch (e) {
      console.error('Group call start error:', e);
      this.finishCall('Camera/microphone unavailable');
    }
  }

  private async handleOffer(msg: any) {
    const callerId: string = msg.callerId || '';
    if (callerId && callerId === this.myId) return;

    const conversationId = this.extractConversationId(msg);
    if (!conversationId) return;

    const status = this.state().status;

    if (status === 'connected' || status === 'connecting' || status === 'outgoing') {
      if (this.state().isGroup && this.state().conversationId === conversationId) {
        let parsedOffer: any;
        try {
          parsedOffer = typeof msg.sdp === 'string' ? JSON.parse(msg.sdp) : msg.sdp;
        } catch { return; }
        if (this.localStream()) {
          // Close existing offerer peer if present (role conflict fix)
          const existingPc = this.peerConnections.get(callerId);
          if (existingPc) {
            try { existingPc.close(); } catch (_) {}
            this.peerConnections.delete(callerId);
          }
          await this.createGroupPeer(conversationId, this.localStream()!, callerId);
          const pc = this.peerConnections.get(callerId);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(parsedOffer?.sdp ?? parsedOffer));
            await this.drainCandidates(pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.ws.sendCallAnswer(conversationId, JSON.stringify(answer), this.myId, callerId);
          }
        }
        return;
      }
      // Non-group: reject if already in a call
      if (status !== 'outgoing') {
        this.ws.sendCallEnd(conversationId, this.myId, callerId);
      }
      return;
    }

    if (status === 'ended' || status === 'incoming') {
      let earlyParsed: any;
      try {
        earlyParsed = typeof msg.sdp === 'string' ? JSON.parse(msg.sdp) : msg.sdp;
      } catch { return; }
      const earlyIsGroup = earlyParsed?.isGroup === true;
      if (status === 'incoming' && earlyIsGroup && this.state().conversationId === conversationId) {
        this.pendingGroupOffers.set(callerId, earlyParsed?.sdp ?? earlyParsed);
        return;
      }
      this.clearAllTimeouts();
      this.cleanup();
    }

    let parsed: any;
    try {
      parsed = typeof msg.sdp === 'string' ? JSON.parse(msg.sdp) : msg.sdp;
    } catch {
      return;
    }
    const kind: CallKind = parsed?.kind === 'audio' ? 'audio' : 'video';
    const isGroup = parsed?.isGroup === true;
    this.pendingOffer = parsed?.sdp ?? parsed;
    this.pendingOfferFrom = callerId;

    this.state.set({
      status: 'incoming',
      direction: 'incoming',
      kind,
      conversationId,
      remoteUserId: callerId,
      remoteName: this.resolveName(callerId),
      endedReason: '',
      isGroup,
      participants: [],
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
      this.createPeer(s.conversationId, stream, s.remoteUserId!);

      await this.pc!.setRemoteDescription(new RTCSessionDescription(this.pendingOffer));
      await this.drainCandidates(this.pc!);

      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);
      this.ws.sendCallAnswer(s.conversationId, JSON.stringify(answer), this.myId, s.remoteUserId ?? '');

      this.pendingOffer = null;
      this.pendingOfferFrom = null;
      this.state.update((st) => ({ ...st, status: 'connecting' }));

      // Process any queued group offers
      if (s.isGroup && this.pendingGroupOffers.size > 0) {
        for (const [callerId, offer] of this.pendingGroupOffers) {
          await this.createGroupPeer(s.conversationId, stream, callerId);
          const pc = this.peerConnections.get(callerId);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            await this.drainCandidates(pc);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            this.ws.sendCallAnswer(s.conversationId, JSON.stringify(ans), this.myId, callerId);
          }
        }
        this.pendingGroupOffers.clear();
      }
    } catch (e) {
      console.error('Accept call error:', e);
      this.endCall('Failed to connect');
    }
  }

  rejectCall() {
    this.endCall('Declined');
  }

  private async handleAnswer(msg: any) {
    const senderId = msg.calleeId || msg.senderId || '';
    const s = this.state();

    if (s.isGroup) {
      const pc = this.peerConnections.get(senderId);
      if (!pc) return;
      try {
        const sdp = typeof msg.sdp === 'string' ? JSON.parse(msg.sdp) : msg.sdp;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await this.drainCandidates(pc);
      } catch (e) {
        console.error('Group answer handling error:', e);
      }
      return;
    }

    if (!this.pc || s.status !== 'outgoing') return;
    this.clearRingTimeout();
    try {
      const sdp = typeof msg.sdp === 'string' ? JSON.parse(msg.sdp) : msg.sdp;
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.drainCandidates(this.pc);
      this.state.update((st) => ({ ...st, status: 'connecting' }));
    } catch (e) {
      console.error('Call answer handling error:', e);
    }
  }

  private async handleIceCandidate(msg: any) {
    if (msg.senderId && msg.senderId === this.myId) return;
    const senderId = msg.senderId || '';

    const candidate: RTCIceCandidateInit = {
      candidate: msg.candidate,
      sdpMid: msg.sdpMid,
      sdpMLineIndex: msg.sdpMLineIndex,
    };

    if (this.state().isGroup) {
      const pc = this.peerConnections.get(senderId);
      if (!pc || !pc.remoteDescription) {
        if (!this.pendingCandidates.has(senderId)) {
          this.pendingCandidates.set(senderId, []);
        }
        this.pendingCandidates.get(senderId)!.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('Group ICE candidate error:', e);
      }
      return;
    }

    if (!this.pc || !this.pc.remoteDescription) {
      this.pendingCandidates.get('_default')?.push(candidate) ?? this.pendingCandidates.set('_default', [candidate]);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('ICE candidate error:', e);
    }
  }

  private async handleGroupJoin(msg: any) {
    const s = this.state();
    if (!s.isGroup || s.status === 'idle' || s.status === 'ended') return;
    if (msg.userId === this.myId) return;

    const newParticipantId = msg.userId;
    if (this.peerConnections.has(newParticipantId)) return;

    const stream = this.localStream();
    if (!stream || !s.conversationId) return;

    // Ownership model: smaller ID is the offerer
    if (this.shouldCreateOfferer(newParticipantId)) {
      await this.createGroupPeer(s.conversationId, stream, newParticipantId);
      const pc = this.peerConnections.get(newParticipantId);
      if (pc) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.ws.sendCallOffer(s.conversationId, JSON.stringify({ sdp: offer, kind: s.kind, isGroup: true }), this.myId, newParticipantId);
      }
    }
    // If we are NOT the offerer, we do nothing here.
    // The new participant will send us an offer (via handleOffer),
    // which will create the answerer peer for us.
  }

  private async handleRemoteEnd(msg: any) {
    if (msg?.userId && msg.userId === this.myId) return;

    const s = this.state();
    if (s.status === 'idle' || s.status === 'ended') return;

    if (s.status === 'incoming') {
      this.finishCall('Call cancelled');
      return;
    }

    if (s.isGroup && msg?.userId) {
      this.removePeer(msg.userId);
      const updated = this.state();
      if (updated.participants.length === 0) {
        this.finishCall('Call ended');
      }
      return;
    }

    this.finishCall('Call ended');
  }

  endCall(reason = 'Call ended') {
    const s = this.state();
    if (s.isGroup && s.conversationId) {
      for (const p of s.participants) {
        this.ws.sendCallEnd(s.conversationId, this.myId, p.userId);
      }
      for (const memberId of this.groupMemberIds) {
        if (!s.participants.find((p) => p.userId === memberId)) {
          this.ws.sendCallEnd(s.conversationId, this.myId, memberId);
        }
      }
    } else if (s.conversationId) {
      this.ws.sendCallEnd(s.conversationId, this.myId, s.remoteUserId ?? '');
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
    this.clearAllTimeouts();
    this.stopConnectionWatchdog();
    this.cleanup();
    this.pendingOffer = null;
    this.pendingOfferFrom = null;
    this.pendingGroupOffers.clear();
    this.groupMemberIds = [];
    this.state.set({ ...IDLE_STATE });
  }

  private finishCall(reason: string) {
    this.clearAllTimeouts();
    this.stopConnectionWatchdog();
    this.cleanup();
    this.pendingOffer = null;
    this.pendingOfferFrom = null;
    this.pendingGroupOffers.clear();
    this.groupMemberIds = [];
    this.state.set({ ...IDLE_STATE, status: 'ended', endedReason: reason });
    this.endedTimeout = setTimeout(() => {
      this.state.set({ ...IDLE_STATE });
    }, 2500);
  }

  private createPeer(conversationId: string, stream: MediaStream, remoteUserId: string) {
    if (this.pc) {
      try { this.pc.close(); } catch (_) {}
    }
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
          this.myId,
          remoteUserId
        );
      }
    };

    this.setupConnectionWatchers(this.pc, remoteUserId);
    this.startConnectionWatchdog();
  }

  private async createGroupPeer(conversationId: string, stream: MediaStream, remoteUserId: string) {
    const existing = this.peerConnections.get(remoteUserId);
    if (existing) {
      try { existing.close(); } catch (_) {}
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    this.peerConnections.set(remoteUserId, pc);
    this.pendingCandidates.set(remoteUserId, []);

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (remoteStream) {
        this.remoteStreamsByPeer.set(remoteUserId, remoteStream);
        this.updateParticipantStream(remoteUserId, remoteStream);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.sendIceCandidate(
          conversationId,
          event.candidate.candidate,
          event.candidate.sdpMid ?? '',
          event.candidate.sdpMLineIndex ?? 0,
          this.myId,
          remoteUserId
        );
      }
    };

    this.setupConnectionWatchers(pc, remoteUserId);
  }

  private setupConnectionWatchers(pc: RTCPeerConnection, remoteUserId: string) {
    const markConnected = () => {
      const iceSt = pc.iceConnectionState;
      if (iceSt === 'connected' || iceSt === 'completed') {
        this.addOrUpdateParticipant(remoteUserId);
        this.checkAllConnected();
      } else if (iceSt === 'failed' || iceSt === 'disconnected') {
        this.removePeer(remoteUserId);
      }
    };

    pc.onconnectionstatechange = markConnected;
    pc.oniceconnectionstatechange = markConnected;
  }

  private addOrUpdateParticipant(userId: string) {
    const s = this.state();
    const existing = s.participants.find((p) => p.userId === userId);
    if (existing) return;

    const stream = this.remoteStreamsByPeer.get(userId) ?? null;

    const participant: ParticipantInfo = {
      userId,
      name: this.resolveName(userId),
      stream,
      audioEnabled: true,
      videoEnabled: true,
    };

    this.state.update((st) => ({
      ...st,
      participants: [...st.participants, participant],
    }));
  }

  private updateParticipantStream(userId: string, stream: MediaStream) {
    this.state.update((st) => ({
      ...st,
      participants: st.participants.map((p) =>
        p.userId === userId ? { ...p, stream } : p
      ),
    }));
  }

  private removePeer(userId: string) {
    const pc = this.peerConnections.get(userId);
    if (pc) {
      try { pc.close(); } catch (_) {}
      this.peerConnections.delete(userId);
    }
    this.pendingCandidates.delete(userId);
    this.remoteStreamsByPeer.delete(userId);

    this.state.update((st) => ({
      ...st,
      participants: st.participants.filter((p) => p.userId !== userId),
    }));
  }

  private checkAllConnected() {
    const s = this.state();
    if (s.status === 'connecting' || s.status === 'outgoing') {
      if (s.participants.length > 0) {
        this.state.update((st) => ({ ...st, status: 'connected' }));
      }
    }
  }

  private tryMarkConnected() {
    const s = this.state().status;
    if (s === 'connecting' || s === 'outgoing') {
      if (this.pc && (this.pc.connectionState === 'connected' || this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed')) {
        this.state.update((st) => ({ ...st, status: 'connected' }));
        this.stopConnectionWatchdog();
      }
    }
  }

  private startConnectionWatchdog() {
    this.stopConnectionWatchdog();
    this.connectionWatchdog = setInterval(() => this.tryMarkConnected(), 500);
    setTimeout(() => this.stopConnectionWatchdog(), 15000);
  }

  private stopConnectionWatchdog() {
    if (this.connectionWatchdog) {
      clearInterval(this.connectionWatchdog);
      this.connectionWatchdog = null;
    }
  }

  private async drainCandidates(pc: RTCPeerConnection) {
    if (!pc) return;
    const senderId = this.findPeerId(pc);
    const candidates = senderId ? (this.pendingCandidates.get(senderId) || []) : (this.pendingCandidates.get('_default') || []);
    if (senderId) this.pendingCandidates.delete(senderId);
    else this.pendingCandidates.delete('_default');

    for (const c of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.warn('Draining ICE error:', e);
      }
    }
  }

  private findPeerId(pc: RTCPeerConnection): string | null {
    for (const [id, p] of this.peerConnections) {
      if (p === pc) return id;
    }
    return null;
  }

  private getMedia(kind: CallKind): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === 'video',
    });
  }

  private extractConversationId(msg: any): string | null {
    if (msg.conversationId) return msg.conversationId;
    if (msg.id) return msg.id;
    return null;
  }

  private shouldCreateOfferer(remoteUserId: string): boolean {
    return this.myId < remoteUserId;
  }

  private clearRingTimeout() {
    if (this.ringTimeout) {
      clearTimeout(this.ringTimeout);
      this.ringTimeout = null;
    }
  }

  private clearAllTimeouts() {
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
    for (const [id, p] of this.peerConnections) {
      try { p.close(); } catch (_) {}
    }
    this.peerConnections.clear();
    this.remoteStreamsByPeer.clear();
    this.pendingCandidates.clear();
    this.localStream.set(null);
    this.remoteStream.set(null);
    this.micEnabled.set(true);
    this.cameraEnabled.set(true);
  }
}
