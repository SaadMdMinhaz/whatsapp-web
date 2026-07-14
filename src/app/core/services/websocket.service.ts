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

  connect(
    token: string,
    onMessage: (msg: any) => void,
    onPresence: (msg: PresenceMessage) => void,
    onTyping: (msg: TypingMessage) => void,
    onRead: (msg: ReadMessage) => void
  ): void {
    if (this.client) {
      this.disconnect();
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

        this.client?.subscribe('/user/queue/messages', (message: IMessage) => {
          onMessage(JSON.parse(message.body));
        });

        this.client?.subscribe('/topic/presence', (message: IMessage) => {
          onPresence(JSON.parse(message.body));
        });

        this.client?.subscribe('/topic/typing/', (message: IMessage) => {
          onTyping(JSON.parse(message.body));
        });

        this.client?.subscribe('/topic/read.', (message: IMessage) => {
          onRead(JSON.parse(message.body));
        });
      },

      onStompError: (frame) => {
        console.error('[WS] STOMP error:', frame.headers?.['message'] || frame.body);
      },

      onWebSocketClose: () => {
        console.log('[WS] Closed');
      },
    });

    this.client.activate();
  }

  subscribeToConversation(conversationId: string, onMessage: (msg: any) => void): void {
    if (this.client?.connected) {
      const sub = this.client.subscribe(`/topic/messages/${conversationId}`, (message: IMessage) => {
        onMessage(JSON.parse(message.body));
      });
      this.conversationSubscriptions.set(conversationId, sub);
    }
  }

  unsubscribeFromConversation(conversationId: string): void {
    const sub = this.conversationSubscriptions.get(conversationId);
    if (sub) {
      sub.unsubscribe();
      this.conversationSubscriptions.delete(conversationId);
    }
  }

  sendTyping(conversationId: string, isTyping: boolean): void {
    if (this.client?.connected) {
      this.client.publish({
        destination: `/app/chat.typing.${conversationId}`,
        body: JSON.stringify({ conversationId, isTyping }),
      });
    }
  }

  sendMarkRead(conversationId: string): void {
    if (this.client?.connected) {
      this.client.publish({
        destination: `/app/chat.markRead.${conversationId}`,
        body: '',
      });
    }
  }

  disconnect(): void {
    this.conversationSubscriptions.forEach((sub) => sub.unsubscribe());
    this.conversationSubscriptions.clear();
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }
  }

  get connected(): boolean {
    return this.client?.connected ?? false;
  }
}
