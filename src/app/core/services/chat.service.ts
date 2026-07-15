import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ParticipantResponse {
  userId: string;
  username: string | null;
  displayName: string | null;
  profilePictureUrl: string | null;
}

export interface ConversationResponse {
  id: string;
  type: 'DIRECT' | 'GROUP';
  otherUser: ParticipantResponse;
  lastMessage: MessageResponse | null;
  unreadCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ConversationDetailResponse {
  id: string;
  type: 'DIRECT' | 'GROUP';
  participants: ParticipantResponse[];
  createdAt: string | null;
  updatedAt: string | null;
  name?: string;
}

export interface MessageResponse {
  id: string;
  conversationId?: string;
  senderId: string;
  content: string;
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';
  mediaUrl: string | null;
  mediaFileName: string | null;
  mediaFileSize: number | null;
  replyToMessageId: string | null;
  repliedMessage: MessageResponse | null;
  isEdited: boolean;
  isDeleted: boolean;
  status: 'SENT' | 'DELIVERED' | 'READ' | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface MessagePageResponse {
  messages: MessageResponse[];
  hasNext: boolean;
  nextCursor: string;
}

export interface SendMessageRequest {
  content: string;
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';
  mediaUrl?: string;
  mediaFileName?: string;
  mediaFileSize?: number;
  replyToMessageId?: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/v1/chats`;

  getConversations(): Observable<ConversationResponse[]> {
    return this.http.get<ConversationResponse[]>(`${this.base}/conversations`);
  }

  getConversation(id: string): Observable<ConversationDetailResponse> {
    return this.http.get<ConversationDetailResponse>(`${this.base}/conversations/${id}`);
  }

  createConversation(recipientUserId: string): Observable<ConversationResponse> {
    return this.http.post<ConversationResponse>(`${this.base}/conversations`, {
      recipientUserId,
    });
  }

  createGroup(name: string, participantIds: string[]): Observable<ConversationResponse> {
    return this.http.post<ConversationResponse>(`${this.base}/conversations/group`, {
      name,
      participantIds,
    });
  }

  getMessages(
    conversationId: string,
    page = 0,
    size = 20
  ): Observable<MessagePageResponse> {
    return this.http.get<MessagePageResponse>(
      `${this.base}/conversations/${conversationId}/messages`,
      { params: { page: page.toString(), size: size.toString() } }
    );
  }

  sendMessage(
    conversationId: string,
    data: SendMessageRequest
  ): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(
      `${this.base}/conversations/${conversationId}/messages`,
      data
    );
  }

  editMessage(messageId: string, data: { content: string }): Observable<MessageResponse> {
    return this.http.put<MessageResponse>(`${this.base}/messages/${messageId}`, data);
  }

  deleteMessage(messageId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/messages/${messageId}`);
  }

  markAsRead(conversationId: string): Observable<void> {
    return this.http.patch<void>(`${this.base}/conversations/${conversationId}/read`, {});
  }
}
