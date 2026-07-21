import { Injectable } from '@angular/core';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client/dist/sockjs';
import { environment } from '../../../environments/environment';

export interface PresenceMessage {
  userId: string;
  online: boolean;
}

export interface TypingMessage {
  userId: string;
  conversationId: string;
  isTyping: boolean;
}

export interface ReadMessage {
  userId: string;
  conversationId: string;
}

export type CallMessageKind = 'offer' | 'answer' | 'iceCandidate' | 'end' | 'group.join';

export interface InboundCallMessage {
  kind: CallMessageKind;
  payload: any;
}

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private client: Client | null = null;
  private conversationSubscriptions = new Map<string, StompSubscription>();
  private pendingConversationSubscriptions = new Map<string, (msg: any) => void>();
  private incomingCallSubscription: StompSubscription | null = null;
  private pendingIncomingCallCallback: ((msg: InboundCallMessage) => void) | null = null;
  private baseCallbacks: {
    onMessage: (msg: any) => void;
    onPresence: (msg: PresenceMessage) => void;
    onTyping: (msg: TypingMessage) => void;
    onRead: (msg: ReadMessage) => void;
  } | null = null;

  connect(
    token: string,
    onMessage: (msg: any) => void,
    onPresence: (msg: PresenceMessage) => void,
    onTyping: (msg: TypingMessage) => void,
    onRead: (msg: ReadMessage) => void,
    onIncomingCall?: (msg: InboundCallMessage) => void
  ): void {
    this.baseCallbacks = { onMessage, onPresence, onTyping, onRead };
    if (onIncomingCall) {
      this.pendingIncomingCallCallback = onIncomingCall;
    }

    if (this.client?.connected) {
      return;
    }

    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }

    const wsUrl = environment.wsUrl || window.location.origin;

    this.client = new Client({
      webSocketFactory: () => new SockJS(`${wsUrl}/ws?token=${token}`) as WebSocket,
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,

      onConnect: () => {
        console.log('[WS] Connected');
        this.resubscribeAll();
      },

      onStompError: (frame: any) => {
        console.error('[WS] STOMP error:', frame.headers?.['message'] || frame.body);
      },

      onWebSocketClose: () => {
        console.log('[WS] Closed');
      },
    });

    this.client.activate();
  }

  private resubscribeAll(): void {
    if (!this.client?.connected || !this.baseCallbacks) return;

    this.client.subscribe('/user/queue/messages', (message: IMessage) => {
      this.baseCallbacks!.onMessage(JSON.parse(message.body));
    });

    this.client.subscribe('/topic/presence', (message: IMessage) => {
      this.baseCallbacks!.onPresence(JSON.parse(message.body));
    });

    this.client.subscribe('/topic/typing/*', (message: IMessage) => {
      this.baseCallbacks!.onTyping(JSON.parse(message.body));
    });

    this.client.subscribe('/topic/read.*', (message: IMessage) => {
      this.baseCallbacks!.onRead(JSON.parse(message.body));
    });

    if (this.pendingIncomingCallCallback) {
      this.subscribeIncomingCalls(this.pendingIncomingCallCallback);
    }

    for (const [conversationId, callback] of this.pendingConversationSubscriptions) {
      const sub = this.client.subscribe(`/topic/messages/${conversationId}`, (message: IMessage) => {
        callback(JSON.parse(message.body));
      });
      this.conversationSubscriptions.set(conversationId, sub);
    }
  }

  subscribeToConversation(conversationId: string, onMessage: (msg: any) => void): void {
    this.pendingConversationSubscriptions.set(conversationId, onMessage);
    if (this.client?.connected) {
      const sub = this.client.subscribe(`/topic/messages/${conversationId}`, (message: IMessage) => {
        onMessage(JSON.parse(message.body));
      });
      this.conversationSubscriptions.set(conversationId, sub);
    }
  }

  unsubscribeFromConversation(conversationId: string): void {
    this.pendingConversationSubscriptions.delete(conversationId);
    const sub = this.conversationSubscriptions.get(conversationId);
    if (sub) {
      sub.unsubscribe();
      this.conversationSubscriptions.delete(conversationId);
    }
  }

  subscribeIncomingCalls(callback: (msg: InboundCallMessage) => void): void {
    this.pendingIncomingCallCallback = callback;
    if (this.client?.connected) {
      if (this.incomingCallSubscription) {
        this.incomingCallSubscription.unsubscribe();
      }
      this.incomingCallSubscription = this.client.subscribe('/user/queue/calls', (message: IMessage) => {
        const body = JSON.parse(message.body);
        let kind: CallMessageKind = 'offer';
        if (body.kind === 'group.join') kind = 'group.join' as CallMessageKind;
        else if (body.calleeId !== undefined) kind = 'answer';
        else if (body.candidate !== undefined) kind = 'iceCandidate';
        else if (body.userId !== undefined && body.sdp === undefined) kind = 'end';
        callback({ kind, payload: body });
      });
    }
  }

  sendTyping(conversationId: string, isTyping: boolean): void {
    this.publish(`/app/chat.typing.${conversationId}`, { conversationId, isTyping });
  }

  sendMarkRead(conversationId: string): void {
    this.publish(`/app/chat.markRead.${conversationId}`, '');
  }

  sendCallOffer(conversationId: string, sdp: string, callerId: string, targetUserId: string) {
    this.publish(`/app/call.offer.${conversationId}`, { callerId, sdp, targetUserId });
  }

  sendCallAnswer(conversationId: string, sdp: string, calleeId: string, targetUserId: string) {
    this.publish(`/app/call.answer.${conversationId}`, { calleeId, sdp, targetUserId });
  }

  sendIceCandidate(conversationId: string, candidate: string, sdpMid: string, sdpMLineIndex: number, senderId: string, targetUserId: string) {
    this.publish(`/app/call.iceCandidate.${conversationId}`, { senderId, candidate, sdpMid, sdpMLineIndex, targetUserId });
  }

  sendCallEnd(conversationId: string, userId: string = '', targetUserId: string = '') {
    this.publish(`/app/call.end.${conversationId}`, { userId, targetUserId });
  }

  sendGroupJoin(conversationId: string, userId: string, userName: string, targetUserId: string, callKind: string, existingParticipantIds: string[] = []) {
    this.publish(`/app/group.call.join.${conversationId}`, { userId, userName, targetUserId, callKind, existingParticipantIds });
  }

  private publish(destination: string, body: any) {
    if (this.client?.connected) {
      this.client.publish({ destination, body: JSON.stringify(body) });
    }
  }

  disconnect(): void {
    this.conversationSubscriptions.forEach((sub) => sub.unsubscribe());
    this.conversationSubscriptions.clear();
    this.incomingCallSubscription?.unsubscribe();
    this.incomingCallSubscription = null;
    this.pendingConversationSubscriptions.clear();
    this.pendingIncomingCallCallback = null;
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }
  }

  get connected(): boolean {
    return this.client?.connected ?? false;
  }
}
