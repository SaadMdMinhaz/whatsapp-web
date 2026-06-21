export type MessageStatus = 'sent' | 'delivered' | 'seen';
export type AttachmentType = 'image' | 'file' | 'voice';

export interface UserProfile {
  id: string;
  name: string;
  handle: string;
  role: 'user' | 'admin';
  avatar: string;
  about: string;
  online: boolean;
  lastSeen: string;
  blocked?: boolean;
}

export interface MessageAttachment {
  id: string;
  type: AttachmentType;
  name: string;
  size: string;
  previewUrl?: string;
  duration?: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  sentAt: string;
  status: MessageStatus;
  attachment?: MessageAttachment;
  deleted?: boolean;
}

export interface ChatThread {
  id: string;
  type: 'direct' | 'group';
  title: string;
  avatar: string;
  memberIds: string[];
  unreadCount: number;
  archived: boolean;
  pinned: boolean;
  muted: boolean;
  typingUserId?: string;
  lastMessage: string;
  lastMessageAt: string;
}

export interface StoryStatus {
  id: string;
  userId: string;
  title: string;
  accent: string;
  postedAt: string;
}
