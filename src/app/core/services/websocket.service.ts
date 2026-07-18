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

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private client: Client | null = null;
  private conversationSubscriptions = new Map<string, StompSubscription>();
  private callSubscriptions = new Map<string, StompSubscription>();
  private pendingConversationSubscriptions = new Map<string, (msg: any) => void>();
  private pendingCallSubscriptions = new Map<string, { type: string; callback: (msg: any) => void }>();
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
    onRead: (msg: ReadMessage) => void
  ): void {
    this.baseCallbacks = { onMessage, onPresence, onTyping, onRead };

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

    for (const [conversationId, callback] of this.pendingConversationSubscriptions) {
      const sub = this.client.subscribe(`/topic/messages/${conversationId}`, (message: IMessage) => {
        callback(JSON.parse(message.body));
      });
      this.conversationSubscriptions.set(conversationId, sub);
    }

    for (const [key, entry] of this.pendingCallSubscriptions) {
      const conversationId = key.split(':').pop()!;
      const sub = this.client.subscribe(`/topic/call.${entry.type}.${conversationId}`, (message: IMessage) => {
        entry.callback(JSON.parse(message.body));
      });
      if (sub) this.callSubscriptions.set(key, sub);
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

  subscribeToCallOffer(conversationId: string, callback: (msg: any) => void) {
    const key = `offer:${conversationId}`;
    this.pendingCallSubscriptions.set(key, { type: 'offer', callback });
    this.callSubscriptions.get(key)?.unsubscribe();
    const sub = this.subscribeTopic(`/topic/call.offer.${conversationId}`, callback);
    if (sub) this.callSubscriptions.set(key, sub);
  }

  subscribeToCallAnswer(conversationId: string, callback: (msg: any) => void) {
    const key = `answer:${conversationId}`;
    this.pendingCallSubscriptions.set(key, { type: 'answer', callback });
    this.callSubscriptions.get(key)?.unsubscribe();
    const sub = this.subscribeTopic(`/topic/call.answer.${conversationId}`, callback);
    if (sub) this.callSubscriptions.set(key, sub);
  }

  subscribeToIceCandidate(conversationId: string, callback: (msg: any) => void) {
    const key = `ice:${conversationId}`;
    this.pendingCallSubscriptions.set(key, { type: 'iceCandidate', callback });
    this.callSubscriptions.get(key)?.unsubscribe();
    const sub = this.subscribeTopic(`/topic/call.iceCandidate.${conversationId}`, callback);
    if (sub) this.callSubscriptions.set(key, sub);
  }

  subscribeToCallEnd(conversationId: string, callback: (msg: any) => void) {
    const key = `end:${conversationId}`;
    this.pendingCallSubscriptions.set(key, { type: 'end', callback });
    this.callSubscriptions.get(key)?.unsubscribe();
    const sub = this.subscribeTopic(`/topic/call.end.${conversationId}`, callback);
    if (sub) this.callSubscriptions.set(key, sub);
  }

  unsubscribeCallTopic(conversationId: string) {
    for (const [key, sub] of this.callSubscriptions) {
      if (key.endsWith(`:${conversationId}`)) {
        sub.unsubscribe();
        this.callSubscriptions.delete(key);
      }
    }
    for (const key of this.pendingCallSubscriptions.keys()) {
      if (key.endsWith(`:${conversationId}`)) {
        this.pendingCallSubscriptions.delete(key);
      }
    }
  }

  sendTyping(conversationId: string, isTyping: boolean): void {
    this.publish(`/app/chat.typing.${conversationId}`, { conversationId, isTyping });
  }

  sendMarkRead(conversationId: string): void {
    this.publish(`/app/chat.markRead.${conversationId}`, '');
  }

  sendCallOffer(conversationId: string, sdp: string, callerId: string) {
    this.publish(`/app/call.offer.${conversationId}`, { callerId, sdp });
  }

  sendCallAnswer(conversationId: string, sdp: string, calleeId: string) {
    this.publish(`/app/call.answer.${conversationId}`, { calleeId, sdp });
  }

  sendIceCandidate(conversationId: string, candidate: string, sdpMid: string, sdpMLineIndex: number, senderId: string) {
    this.publish(`/app/call.iceCandidate.${conversationId}`, { senderId, candidate, sdpMid, sdpMLineIndex });
  }

  sendCallEnd(conversationId: string, userId: string = '') {
    this.publish(`/app/call.end.${conversationId}`, { userId });
  }

  private subscribeTopic(topic: string, callback: (msg: any) => void): StompSubscription | undefined {
    if (this.client?.connected) {
      return this.client.subscribe(topic, (message: IMessage) => {
        callback(JSON.parse(message.body));
      });
    }
    return undefined;
  }

  private publish(destination: string, body: any) {
    if (this.client?.connected) {
      this.client.publish({ destination, body: JSON.stringify(body) });
    }
  }

  disconnect(): void {
    this.conversationSubscriptions.forEach((sub) => sub.unsubscribe());
    this.conversationSubscriptions.clear();
    this.callSubscriptions.forEach((sub) => sub.unsubscribe());
    this.callSubscriptions.clear();
    this.pendingConversationSubscriptions.clear();
    this.pendingCallSubscriptions.clear();
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }
  }

  get connected(): boolean {
    return this.client?.connected ?? false;
  }
}
