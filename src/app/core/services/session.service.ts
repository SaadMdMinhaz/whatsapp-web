import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UserProfile } from '../models/chat.models';

const STORAGE_KEY = 'connectly.session';

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly currentUser = signal<UserProfile | null>(this.readSession());

  constructor(private readonly router: Router) {}

  login(email: string): void {
    const user = this.createUser('Ayaan Khan', email);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    this.currentUser.set(user);
    void this.router.navigateByUrl('/app/chats');
  }

  register(name: string, email: string): void {
    const user = this.createUser(name, email);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    this.currentUser.set(user);
    void this.router.navigateByUrl('/app/chats');
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.currentUser.set(null);
    void this.router.navigateByUrl('/login');
  }

  private createUser(name: string, email: string): UserProfile {
    return {
      id: 'u1',
      name,
      handle: email,
      role: 'user',
      avatar: name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'U',
      about: 'Hey there, I am using Connectly.',
      online: true,
      lastSeen: 'Online'
    };
  }

  private readSession(): UserProfile | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  }
}
