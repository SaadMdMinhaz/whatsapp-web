export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  username: string;
  about: string;
  profilePictureUrl: string;
  phoneNumber: string;
  active: boolean;
}

export interface MessageAttachment {
  id: string;
  type: 'image' | 'file' | 'voice' | 'video' | 'audio';
  name: string;
  size: string;
  previewUrl?: string;
  duration?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: MessageType;
  mediaUrl: string;
  mediaFileName: string;
  mediaFileSize: number;
  replyToMessageId: string;
  isEdited: boolean;
  isDeleted: boolean;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Participant {
  userId: string;
  displayName: string;
  username: string;
  profilePictureUrl: string;
}

export interface ChatThread {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string;
  avatar: string;
  memberIds: string[];
  unreadCount: number;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageSenderId: string;
  archived: boolean;
  typingUserId?: string;
  otherUser: Participant;
}
