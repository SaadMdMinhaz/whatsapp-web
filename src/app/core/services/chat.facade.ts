import { Injectable, inject, signal, computed } from '@angular/core';
import { ChatService, ConversationResponse, MessageResponse, SendMessageRequest } from './chat.service';
import { MediaService } from './media.service';
import { UserService, UserProfileResponse } from './user.service';
import { SessionService } from './session.service';
import { ChatMessage, ChatThread, Participant } from '../models/chat.models';
import { forkJoin } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChatFacade {
  private readonly chatService = inject(ChatService);
  private readonly mediaService = inject(MediaService);
  private readonly userService = inject(UserService);
  private readonly session = inject(SessionService);

  readonly threads = signal<ChatThread[]>([]);
  readonly messages = signal<ChatMessage[]>([]);
  readonly loading = signal(false);
  readonly onlineUserIds = signal<Set<string>>(new Set());

  readonly activeThreads = computed(() =>
    this.threads().filter((t) => !t.archived)
  );

  loadConversations() {
    this.loading.set(true);
    this.chatService.getConversations().subscribe({
      next: (convos) => {
        this.threads.set(convos.map((c) => this.mapConversation(c)));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadMessages(conversationId: string, page = 0, size = 30) {
    this.chatService.getMessages(conversationId, page, size).subscribe({
      next: (pageData) => {
        if (page === 0) {
          this.messages.set(pageData.messages.map((m) => this.mapMessage(m)));
        } else {
          this.messages.update((prev) => [
            ...pageData.messages.map((m) => this.mapMessage(m)),
            ...prev,
          ]);
        }
      },
    });
  }

  sendMessage(conversationId: string, content: string) {
    const request: SendMessageRequest = { content, messageType: 'TEXT' };
    this.chatService.sendMessage(conversationId, request).subscribe({
      next: (msg) => {
        this.messages.update((prev) => [...prev, this.mapMessage(msg)]);
        this.threads.update((threads) =>
          threads.map((t) =>
            t.id === conversationId
              ? { ...t, lastMessage: content, lastMessageAt: this.formatTime(msg.createdAt) }
              : t
          )
        );
      },
    });
  }

  createConversation(recipientUserId: string) {
    return this.chatService.createConversation(recipientUserId);
  }

  markAsRead(conversationId: string) {
    this.chatService.markAsRead(conversationId).subscribe();
    this.threads.update((threads) =>
      threads.map((t) =>
        t.id === conversationId ? { ...t, unreadCount: 0 } : t
      )
    );
  }

  handleIncomingMessage(msg: MessageResponse) {
    const mapped = this.mapMessage(msg);
    this.messages.update((prev) => {
      if (prev.find((m) => m.id === msg.id)) return prev;
      return [...prev, mapped];
    });
    this.threads.update((threads) =>
      threads.map((t) =>
        t.id === msg.conversationId
          ? {
              ...t,
              lastMessage: msg.content || `[${msg.messageType}]`,
              lastMessageAt: this.formatTime(msg.createdAt),
              unreadCount: t.id === msg.conversationId ? t.unreadCount + 1 : t.unreadCount,
            }
          : t
      )
    );
  }

  handlePresence(userId: string, online: boolean) {
    this.onlineUserIds.update((set) => {
      const next = new Set(set);
      if (online) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  getThread(threadId: string): ChatThread | undefined {
    return this.threads().find((t) => t.id === threadId);
  }

  getUserDisplayName(userId: string): string {
    const thread = this.threads().find((t) =>
      t.participants.some((p) => p.userId === userId)
    );
    const participant = thread?.participants.find((p) => p.userId === userId);
    return participant?.displayName || 'Unknown';
  }

  toggleArchive(threadId: string) {
    this.threads.update((threads) =>
      threads.map((t) =>
        t.id === threadId ? { ...t, archived: !t.archived } : t
      )
    );
  }

  private mapConversation(c: ConversationResponse): ChatThread {
    const currentUserId = this.session.currentUser()?.id;
    const otherParticipant = c.participants.find((p) => p.userId !== currentUserId);
    const title = c.type === 'DIRECT' && otherParticipant
      ? otherParticipant.displayName
      : c.name || 'Group Chat';
    const avatar = title
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return {
      id: c.id,
      type: c.type,
      title,
      avatar,
      memberIds: c.participants.map((p) => p.userId),
      unreadCount: c.unreadCount || 0,
      lastMessage: c.lastMessage
        ? c.lastMessage.content || `[${c.lastMessage.messageType}]`
        : '',
      lastMessageAt: c.lastMessage ? this.formatTime(c.lastMessage.createdAt) : '',
      lastMessageSenderId: c.lastMessage?.senderId || '',
      archived: false,
      participants: c.participants,
    };
  }

  private mapMessage(m: MessageResponse): ChatMessage {
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      content: m.content || '',
      messageType: m.messageType,
      mediaUrl: m.mediaUrl,
      mediaFileName: m.mediaFileName,
      mediaFileSize: m.mediaFileSize,
      replyToMessageId: m.replyToMessageId,
      isEdited: m.isEdited,
      isDeleted: m.isDeleted,
      status: m.status,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  private formatTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  }
}
