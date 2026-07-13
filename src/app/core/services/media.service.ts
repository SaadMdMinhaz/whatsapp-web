import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MediaResponse {
  id: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  mediaType: string;
  uploaderId: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/v1/media`;

  upload(file: File, mediaType?: string): Observable<MediaResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (mediaType) {
      formData.append('mediaType', mediaType);
    }
    return this.http.post<MediaResponse>(this.base, formData);
  }

  getMetadata(id: string): Observable<MediaResponse> {
    return this.http.get<MediaResponse>(`${this.base}/${id}`);
  }

  getDownloadUrl(id: string): string {
    return `${this.base}/${id}/file`;
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
