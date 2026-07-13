import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthUser } from '../models/chat.models';
import { AuthService, AuthResponse } from './auth.service';
import { WebSocketService } from './websocket.service';
import { UserService, UserProfileResponse } from './user.service';
import { Observable, catchError, map, tap, throwError } from 'rxjs';

const TOKEN_KEY = 'connectly.accessToken';
const REFRESH_KEY = 'connectly.refreshToken';
const USER_KEY = 'connectly.user';

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly currentUser = signal<AuthUser | null>(this.readUser());
  readonly accessToken = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly refreshToken = signal<string | null>(localStorage.getItem(REFRESH_KEY));
  readonly userProfile = signal<UserProfileResponse | null>(null);

  constructor(
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly wsService: WebSocketService,
    private readonly userService: UserService,
  ) {}

  login(email: string, password: string): Observable<AuthResponse> {
    return this.authService.login(email, password).pipe(
      tap((res) => this.handleAuthResponse(res))
    );
  }

  register(name: string, email: string, password: string): Observable<AuthResponse> {
    return this.authService.register({ name, email, password }).pipe(
      tap((res) => this.handleAuthResponse(res))
    );
  }

  private handleAuthResponse(res: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(REFRESH_KEY, res.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.accessToken.set(res.accessToken);
    this.refreshToken.set(res.refreshToken);
    this.currentUser.set(res.user);
    this.connectWebSocket(res.accessToken);
    this.loadProfile(res.user.id);
    void this.router.navigateByUrl('/app/chats');
  }

  connectWebSocket(token: string) {
    this.wsService.connect(
      token,
      () => {},
      () => {},
      () => {},
      () => {},
    );
  }

  loadProfile(userId: string) {
    this.userService.getUser(userId).subscribe({
      next: (profile) => this.userProfile.set(profile),
      error: () => {},
    });
  }

  refreshAccessToken(): Observable<{ accessToken: string; refreshToken: string }> {
    const rt = this.refreshToken();
    if (!rt) {
      return throwError(() => new Error('No refresh token'));
    }
    return this.authService.refresh(rt).pipe(
      tap((res) => {
        localStorage.setItem(TOKEN_KEY, res.accessToken);
        localStorage.setItem(REFRESH_KEY, res.refreshToken);
        this.accessToken.set(res.accessToken);
        this.refreshToken.set(res.refreshToken);
      })
    );
  }

  logout() {
    this.wsService.disconnect();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    this.accessToken.set(null);
    this.refreshToken.set(null);
    this.currentUser.set(null);
    this.userProfile.set(null);
    void this.router.navigateByUrl('/login');
  }

  private readUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  }
}
