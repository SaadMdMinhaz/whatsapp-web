import { Injectable, computed, signal } from '@angular/core';
import { ChatMessage, ChatThread, StoryStatus, UserProfile } from '../models/chat.models';

@Injectable({ providedIn: 'root' })
export class ChatFacade {
  readonly users = signal<UserProfile[]>([
    { id: 'u1', name: 'Ayaan Khan', handle: 'user@connectly.dev', role: 'user', avatar: 'AK', about: 'Hey there, I am using Connectly.', online: true, lastSeen: 'Online' },
    { id: 'u2', name: 'Nadia Rahman', handle: 'nadia@connectly.dev', role: 'user', avatar: 'NR', about: 'Available', online: true, lastSeen: 'Online' },
    { id: 'u3', name: 'Rafi Chowdhury', handle: 'rafi@connectly.dev', role: 'user', avatar: 'RC', about: 'At work', online: false, lastSeen: 'Last seen 14 min ago' },
    { id: 'u4', name: 'Mira Sultana', handle: 'mira@connectly.dev', role: 'user', avatar: 'MS', about: 'Battery about to die', online: true, lastSeen: 'Online' },
    { id: 'u5', name: 'Family Group', handle: 'family@connectly.dev', role: 'user', avatar: 'FG', about: 'Family updates', online: false, lastSeen: 'Today' }
  ]);

  readonly stories = signal<StoryStatus[]>([
    { id: 's1', userId: 'u2', title: 'Nadia Rahman', accent: '#0f766e', postedAt: '12 min ago' },
    { id: 's2', userId: 'u3', title: 'Rafi Chowdhury', accent: '#2563eb', postedAt: '38 min ago' },
    { id: 's3', userId: 'u4', title: 'Mira Sultana', accent: '#9333ea', postedAt: '1 hr ago' }
  ]);

  readonly threads = signal<ChatThread[]>([
    { id: 'c1', type: 'direct', title: 'Nadia Rahman', avatar: 'NR', memberIds: ['u1', 'u2'], unreadCount: 2, archived: false, pinned: true, muted: false, typingUserId: 'u2', lastMessage: 'Typing...', lastMessageAt: '08:34 PM' },
    { id: 'c2', type: 'group', title: 'Friends Weekend', avatar: 'FW', memberIds: ['u1', 'u2', 'u3', 'u4'], unreadCount: 5, archived: false, pinned: true, muted: false, lastMessage: 'Rafi: I sent the photos', lastMessageAt: '07:58 PM' },
    { id: 'c3', type: 'direct', title: 'Mira Sultana', avatar: 'MS', memberIds: ['u1', 'u4'], unreadCount: 0, archived: false, pinned: false, muted: true, lastMessage: 'Voice note', lastMessageAt: '06:11 PM' },
    { id: 'c4', type: 'direct', title: 'Rafi Chowdhury', avatar: 'RC', memberIds: ['u1', 'u3'], unreadCount: 0, archived: false, pinned: false, muted: false, lastMessage: 'Call me when you are free.', lastMessageAt: 'Yesterday' },
    { id: 'c5', type: 'group', title: 'Family Group', avatar: 'FG', memberIds: ['u1', 'u5'], unreadCount: 0, archived: true, pinned: false, muted: false, lastMessage: 'Dinner at 8?', lastMessageAt: 'Friday' }
  ]);

  readonly messages = signal<ChatMessage[]>([
    { id: 'm1', threadId: 'c1', senderId: 'u2', body: 'Are you coming online now?', sentAt: '08:20 PM', status: 'seen' },
    { id: 'm2', threadId: 'c1', senderId: 'u1', body: 'Yes, I am here. Send me the image.', sentAt: '08:26 PM', status: 'seen' },
    { id: 'm3', threadId: 'c1', senderId: 'u2', body: 'Typing...', sentAt: '08:34 PM', status: 'delivered' },
    { id: 'm4', threadId: 'c2', senderId: 'u3', body: 'I sent the photos from yesterday.', sentAt: '07:42 PM', status: 'seen', attachment: { id: 'a1', type: 'image', name: 'weekend-photos.zip', size: '4.2 MB' } },
    { id: 'm5', threadId: 'c3', senderId: 'u4', body: '', sentAt: '06:11 PM', status: 'delivered', attachment: { id: 'a2', type: 'voice', name: 'voice-note.webm', size: '86 KB', duration: '0:24' } },
    { id: 'm6', threadId: 'c4', senderId: 'u3', body: 'Call me when you are free.', sentAt: 'Yesterday', status: 'seen' }
  ]);

  readonly activeThreads = computed(() => this.threads().filter((thread) => !thread.archived));
  readonly archivedThreads = computed(() => this.threads().filter((thread) => thread.archived));
  readonly onlineUsers = computed(() => this.users().filter((user) => user.online));

  getThread(threadId: string): ChatThread | undefined {
    return this.threads().find((thread) => thread.id === threadId);
  }

  getMessages(threadId: string): ChatMessage[] {
    return this.messages().filter((message) => message.threadId === threadId);
  }

  getUser(userId: string): UserProfile | undefined {
    return this.users().find((user) => user.id === userId);
  }

  sendMessage(threadId: string, body: string): void {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      threadId,
      senderId: 'u1',
      body,
      sentAt: new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
      status: 'sent'
    };
    this.messages.update((messages) => [...messages, message]);
    this.threads.update((threads) => threads.map((thread) => thread.id === threadId ? { ...thread, lastMessage: body, lastMessageAt: message.sentAt, unreadCount: 0, typingUserId: undefined } : thread));
    window.setTimeout(() => this.updateMessageStatus(message.id, 'delivered'), 700);
    window.setTimeout(() => this.updateMessageStatus(message.id, 'seen'), 1400);
  }

  toggleArchive(threadId: string): void {
    this.threads.update((threads) => threads.map((thread) => thread.id === threadId ? { ...thread, archived: !thread.archived } : thread));
  }

  blockUser(userId: string): void {
    this.users.update((users) => users.map((user) => user.id === userId ? { ...user, blocked: !user.blocked, online: false } : user));
  }

  private updateMessageStatus(messageId: string, status: ChatMessage['status']): void {
    this.messages.update((messages) => messages.map((message) => message.id === messageId ? { ...message, status } : message));
  }
}
