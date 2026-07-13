import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Participant {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  profilePictureUrl: string;
}

export interface ConversationResponse {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name: string;
  participants: Participant[];
  lastMessage: MessageResponse | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
}

export interface MessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';
  mediaUrl: string;
  mediaFileName: string;
  mediaFileSize: number;
  replyToMessageId: string;
  isEdited: boolean;
  isDeleted: boolean;
  status: 'SENT' | 'DELIVERED' | 'READ';
  createdAt: string;
  updatedAt: string;
}

export interface MessagePage {
  messages: MessageResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
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

  createConversation(recipientUserId: string): Observable<ConversationResponse> {
    return this.http.post<ConversationResponse>(`${this.base}/conversations`, {
      recipientUserId,
    });
  }

  getConversation(id: string): Observable<ConversationResponse> {
    return this.http.get<ConversationResponse>(`${this.base}/conversations/${id}`);
  }

  getMessages(
    conversationId: string,
    page = 0,
    size = 30
  ): Observable<MessagePage> {
    return this.http.get<MessagePage>(
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
