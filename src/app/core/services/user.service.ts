import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UserProfileResponse {
  id: string;
  phoneNumber: string;
  username: string;
  displayName: string;
  about: string;
  profilePictureUrl: string;
  createdAt: string;
  updatedAt: string;
  active: boolean;
}

export interface ContactResponse {
  id: string;
  contactUserId: string;
  nickname: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/v1/users`;

  getUser(id: string): Observable<UserProfileResponse> {
    return this.http.get<UserProfileResponse>(`${this.base}/${id}`);
  }

  updateUser(id: string, data: Partial<UserProfileResponse>): Observable<UserProfileResponse> {
    return this.http.put<UserProfileResponse>(`${this.base}/${id}`, data);
  }

  searchUsers(query: string): Observable<UserProfileResponse[]> {
    return this.http.get<UserProfileResponse[]>(`${this.base}/search`, {
      params: { q: query },
    });
  }

  getContacts(): Observable<ContactResponse[]> {
    return this.http.get<ContactResponse[]>(`${this.base}/contacts`);
  }

  addContact(data: { contactUserId: string; nickname?: string }): Observable<ContactResponse> {
    return this.http.post<ContactResponse>(`${this.base}/contacts`, data);
  }

  deleteContact(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/contacts/${id}`);
  }

  getBlockedUsers(): Observable<UserProfileResponse[]> {
    return this.http.get<UserProfileResponse[]>(`${this.base}/blocked`);
  }

  blockUser(blockedUserId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/block`, { blockedUserId });
  }

  unblockUser(blockedUserId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/block/${blockedUserId}`);
  }
}
