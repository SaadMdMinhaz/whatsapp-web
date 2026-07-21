import { Injectable, Injector, inject, signal, computed } from '@angular/core';
import { ChatService, ConversationResponse, MessageResponse, SendMessageRequest, ParticipantResponse } from './chat.service';
import { MediaService } from './media.service';
import { UserService, UserProfileResponse } from './user.service';
import { SessionService } from './session.service';
import { ChatMessage, ChatThread, Participant } from '../models/chat.models';

@Injectable({ providedIn: 'root' })
export class ChatFacade {
  private readonly chatService = inject(ChatService);
  private readonly mediaService = inject(MediaService);
  private readonly userService = inject(UserService);
  private readonly session = inject(SessionService);
  private readonly injector = inject(Injector);

  readonly threads = signal<ChatThread[]>([]);
  readonly messages = signal<ChatMessage[]>([]);
  readonly loading = signal(false);
  readonly onlineUserIds = signal<Set<string>>(new Set());
  readonly typingUsers = signal<Map<string, Set<string>>>(new Map());
  private readonly profileCache = new Map<string, UserProfileResponse>();

  readonly activeThreads = computed(() =>
    this.threads().filter((t) => !t.archived)
  );

  readonly sortedMessages = computed(() =>
    [...this.messages()].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
  );

  loadConversations() {
    this.loading.set(true);
    this.chatService.getConversations().subscribe({
      next: (convos) => {
        const mapped = convos.map((c) => this.mapConversation(c));
        this.threads.set(mapped);

        const allUserIds = new Set<string>();
        for (const thread of mapped) {
          allUserIds.add(thread.otherUser.userId);
        }
        for (const uid of allUserIds) {
          this.fetchAndCacheProfile(uid);
        }

        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load conversations:', err);
        this.loading.set(false);
      },
    });
  }

  loadMessages(conversationId: string, page = 0, size = 30) {
    this.chatService.getMessages(conversationId, page, size).subscribe({
      next: (pageData) => {
        const mapped = pageData.messages.map((m) => this.mapMessage(m, conversationId));
        if (page === 0) {
          this.messages.set(mapped);
        } else {
          this.messages.update((prev) => [...mapped, ...prev]);
        }
      },
      error: (err) => console.error('Failed to load messages:', err),
    });
  }

  sendMessage(conversationId: string, content: string) {
    const request: SendMessageRequest = { content, messageType: 'TEXT' };
    this.chatService.sendMessage(conversationId, request).subscribe({
      next: (msg) => {
        const mapped = this.mapMessage(msg, conversationId);
        this.messages.update((prev) => [...prev, mapped]);
        this.threads.update((threads) =>
          threads.map((t) =>
            t.id === conversationId
              ? { ...t, lastMessage: content, lastMessageAt: this.formatTime(msg.createdAt) }
              : t
          )
        );
      },
      error: (err) => console.error('Failed to send message:', err),
    });
  }

  sendMediaMessage(conversationId: string, file: File) {
    this.mediaService.upload(file).subscribe({
      next: (media) => {
        const request: SendMessageRequest = {
          content: '',
          messageType: this.getMediaType(file.type),
          mediaUrl: media.id,
          mediaFileName: file.name,
          mediaFileSize: file.size,
        };
        this.chatService.sendMessage(conversationId, request).subscribe({
          next: (msg) => {
            this.messages.update((prev) => [...prev, this.mapMessage(msg, conversationId)]);
          },
          error: (err) => console.error('Failed to send media message:', err),
        });
      },
      error: (err) => console.error('Failed to upload media:', err),
    });
  }

  private getMediaType(mimeType: string): 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO' {
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (mimeType.startsWith('audio/')) return 'AUDIO';
    return 'DOCUMENT';
  }

  createConversation(recipientUserId: string) {
    return this.chatService.createConversation(recipientUserId);
  }

  createGroup(name: string, participantIds: string[]) {
    return this.chatService.createGroup(name, participantIds);
  }

  markAsRead(conversationId: string) {
    this.chatService.markAsRead(conversationId).subscribe({
      error: (err) => console.error('Failed to mark as read:', err),
    });
    this.threads.update((threads) =>
      threads.map((t) =>
        t.id === conversationId ? { ...t, unreadCount: 0 } : t
      )
    );
  }

  handleIncomingMessage(msg: any) {
    const msgId = msg.id || msg.messageId || '';
    const convId = msg.conversationId || msg.conversationId || '';
    const content = msg.content || '';
    const messageType = msg.messageType || 'TEXT';
    const senderId = msg.senderId || '';
    const createdAt = msg.createdAt || new Date().toISOString();

    if (senderId && !this.profileCache.has(senderId)) {
      this.fetchAndCacheProfile(senderId);
    }

    const mapped: ChatMessage = {
      id: msgId,
      conversationId: convId,
      senderId,
      content,
      messageType,
      mediaUrl: msg.mediaUrl || '',
      mediaFileName: msg.mediaFileName || '',
      mediaFileSize: msg.mediaFileSize || 0,
      replyToMessageId: msg.replyToMessageId || '',
      isEdited: msg.isEdited || false,
      isDeleted: msg.isDeleted || false,
      status: msg.status || 'SENT',
      createdAt,
      updatedAt: msg.updatedAt || '',
    };
    this.messages.update((prev) => {
      if (prev.find((m) => m.id === msgId)) return prev;
      return [...prev, mapped];
    });
    const existing = this.threads().find((t) => t.id === convId);
    if (existing) {
      this.threads.update((threads) =>
        threads.map((t) =>
          t.id === convId
            ? {
                ...t,
                lastMessage: content || `[${messageType}]`,
                lastMessageAt: this.formatTime(createdAt),
                unreadCount: t.unreadCount + 1,
              }
            : t
        )
      );
    } else {
      this.loadConversations();
    }
  }

  handlePresence(userId: string, online: boolean) {
    this.onlineUserIds.update((set) => {
      const next = new Set(set);
      if (online) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  handleTyping(conversationId: string, userId: string, isTyping: boolean) {
    this.typingUsers.update((map) => {
      const next = new Map(map);
      const users = new Set(next.get(conversationId) || []);
      if (isTyping) users.add(userId);
      else users.delete(userId);
      if (users.size > 0) next.set(conversationId, users);
      else next.delete(conversationId);
      return next;
    });
    this.threads.update((threads) =>
      threads.map((t) =>
        t.id === conversationId ? { ...t, typingUserId: isTyping ? userId : undefined } : t
      )
    );
  }

  handleReadReceipt(conversationId: string, userId: string) {
    this.messages.update((msgs) =>
      msgs.map((m) =>
        m.senderId !== userId && m.conversationId === conversationId
          ? { ...m, status: 'READ' as const }
          : m
      )
    );
  }

  getThread(threadId: string): ChatThread | undefined {
    return this.threads().find((t) => t.id === threadId);
  }

  getUserDisplayName(userId: string): string {
    const cached = this.profileCache.get(userId);
    if (cached) return cached.displayName || cached.username || userId.slice(0, 8);
    for (const t of this.threads()) {
      if (t.otherUser.userId === userId) {
        return t.otherUser.displayName || t.otherUser.username || userId.slice(0, 8);
      }
    }
    return userId.slice(0, 8);
  }

  getUserProfile(userId: string): UserProfileResponse | undefined {
    return this.profileCache.get(userId);
  }

  fetchAndCacheProfile(userId: string): void {
    if (this.profileCache.has(userId)) return;
    this.profileCache.set(userId, null as any);
    this.userService.getUser(userId).subscribe({
      next: (profile) => {
        this.profileCache.set(userId, profile);
        this.threads.update((ts) =>
          ts.map((t) => {
            if (t.otherUser.userId === userId) {
              const name = profile.displayName || profile.username || t.title;
              return { ...t, title: name, otherUser: { ...t.otherUser, displayName: name, username: profile.username || t.otherUser.username, profilePictureUrl: profile.profilePictureUrl || t.otherUser.profilePictureUrl } };
            }
            return t;
          })
        );
      },
      error: () => {},
    });
  }

  toggleArchive(threadId: string) {
    this.threads.update((threads) =>
      threads.map((t) =>
        t.id === threadId ? { ...t, archived: !t.archived } : t
      )
    );
  }

  getConversationDetail(conversationId: string) {
    return this.chatService.getConversation(conversationId);
  }

  blockUser(userId: string) {
    return this.userService.blockUser(userId);
  }

  unblockUser(userId: string) {
    return this.userService.unblockUser(userId);
  }

  deleteThread(threadId: string) {
    this.threads.update((ts) => ts.filter((t) => t.id !== threadId));
  }

  clearMessages(conversationId: string) {
    this.messages.set([]);
  }

  private mapConversation(c: ConversationResponse): ChatThread {
    const isGroup = c.type === 'GROUP';
    const hasBackendName = !!(c.otherUser.displayName || c.otherUser.username);

    let displayName: string;
    const cached = this.profileCache.get(c.otherUser.userId);

    if (isGroup) {
      displayName = c.otherUser.displayName || 'Group';
    } else if (hasBackendName) {
      displayName = c.otherUser.displayName || c.otherUser.username!;
    } else if (cached) {
      displayName = cached.displayName || cached.username || '';
    } else {
      displayName = '';
    }

    const otherUser: Participant = {
      userId: c.otherUser.userId,
      displayName,
      username: c.otherUser.username || cached?.username || '',
      profilePictureUrl: c.otherUser.profilePictureUrl || cached?.profilePictureUrl || '',
    };
    const title = displayName || c.otherUser.userId.slice(0, 8);
    const avatar = displayName
      ? displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
      : c.otherUser.userId.slice(0, 2).toUpperCase();

    const thread: ChatThread = {
      id: c.id,
      type: c.type,
      title,
      avatar,
      memberIds: [otherUser.userId],
      unreadCount: c.unreadCount || 0,
      lastMessage: c.lastMessage
        ? c.lastMessage.content || `[${c.lastMessage.messageType}]`
        : '',
      lastMessageAt: c.lastMessage ? this.formatTime(c.lastMessage.createdAt) : '',
      lastMessageSenderId: c.lastMessage?.senderId || '',
      archived: false,
      otherUser,
    };

    if (isGroup) {
      this.chatService.getConversation(c.id).subscribe({
        next: (detail) => {
          const ids = detail.participants.map((p) => p.userId);
          this.threads.update((ts) =>
            ts.map((t) => (t.id === c.id ? { ...t, memberIds: ids } : t))
          );
          for (const uid of ids) {
            this.fetchAndCacheProfile(uid);
          }
        },
      });
    }

    return thread;
  }

  private mapMessage(m: MessageResponse, conversationId: string): ChatMessage {
    return {
      id: m.id,
      conversationId,
      senderId: m.senderId,
      content: m.content || '',
      messageType: m.messageType,
      mediaUrl: m.mediaUrl || '',
      mediaFileName: m.mediaFileName || '',
      mediaFileSize: m.mediaFileSize || 0,
      replyToMessageId: m.replyToMessageId || '',
      isEdited: m.isEdited,
      isDeleted: m.isDeleted,
      status: m.status || 'SENT',
      createdAt: m.createdAt,
      updatedAt: m.updatedAt || '',
    };
  }

  private formatTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  }
}
