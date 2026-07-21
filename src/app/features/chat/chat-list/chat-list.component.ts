import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChatFacade } from '../../../core/services/chat.facade';
import { UserService, UserProfileResponse } from '../../../core/services/user.service';
import { SessionService } from '../../../core/services/session.service';

@Component({
  selector: 'app-chat-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './chat-list.component.html',
  styleUrl: './chat-list.component.scss',
})
export class ChatListComponent implements OnInit {
  readonly chat = inject(ChatFacade);
  private readonly userService = inject(UserService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly query = signal('');
  readonly showNewChat = signal(false);
  readonly searchQuery = signal('');
  readonly searchResults = signal<UserProfileResponse[]>([]);

  readonly showCreateGroup = signal(false);
  readonly groupName = signal('');
  readonly groupSearchQuery = signal('');
  readonly groupSearchResults = signal<UserProfileResponse[]>([]);
  readonly selectedMembers = signal<UserProfileResponse[]>([]);

  readonly selectedProfile = signal<UserProfileResponse | null>(null);

  readonly threads = computed(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) return this.chat.activeThreads();
    return this.chat.activeThreads().filter((t) =>
      t.title.toLowerCase().includes(term)
    );
  });

  ngOnInit() {
    this.chat.loadConversations();
  }

  updateSearch(event: Event) {
    this.query.set((event.target as HTMLInputElement).value);
  }

  toggleNewChat() {
    this.showNewChat.update((v) => !v);
    this.showCreateGroup.set(false);
    this.searchQuery.set('');
    this.searchResults.set([]);
  }

  toggleCreateGroup() {
    this.showCreateGroup.update((v) => !v);
    this.groupName.set('');
    this.groupSearchQuery.set('');
    this.groupSearchResults.set([]);
    this.selectedMembers.set([]);
  }

  searchUsers(event: Event) {
    const q = (event.target as HTMLInputElement).value;
    this.searchQuery.set(q);
    if (q.length < 2) {
      this.searchResults.set([]);
      return;
    }
    this.userService.searchUsers(q).subscribe({
      next: (users) => {
        const currentUserId = this.session.currentUser()?.id;
        this.searchResults.set(users.filter((u) => u.id !== currentUserId));
      },
    });
  }

  startConversation(userId: string) {
    this.chat.createConversation(userId).subscribe({
      next: (convo) => {
        this.showNewChat.set(false);
        this.searchQuery.set('');
        this.searchResults.set([]);
        this.router.navigate(['/app/chats', convo.id]);
      },
    });
  }

  searchGroupMembers(event: Event) {
    const q = (event.target as HTMLInputElement).value;
    this.groupSearchQuery.set(q);
    if (q.length < 2) {
      this.groupSearchResults.set([]);
      return;
    }
    this.userService.searchUsers(q).subscribe({
      next: (users) => {
        const currentUserId = this.session.currentUser()?.id;
        const alreadySelected = new Set(this.selectedMembers().map((m) => m.id));
        this.groupSearchResults.set(
          users.filter((u) => u.id !== currentUserId && !alreadySelected.has(u.id))
        );
      },
    });
  }

  addMember(user: UserProfileResponse) {
    this.selectedMembers.update((prev) => [...prev, user]);
    this.groupSearchResults.set([]);
    this.groupSearchQuery.set('');
  }

  removeMember(userId: string) {
    this.selectedMembers.update((prev) => prev.filter((m) => m.id !== userId));
  }

  updateGroupName(event: Event) {
    this.groupName.set((event.target as HTMLInputElement).value);
  }

  createGroup() {
    const name = this.groupName().trim();
    const members = this.selectedMembers();
    if (!name || members.length === 0) return;

    this.chat.createGroup(name, members.map((m) => m.id)).subscribe({
      next: (convo) => {
        this.showCreateGroup.set(false);
        this.showNewChat.set(false);
        this.groupName.set('');
        this.selectedMembers.set([]);
        this.router.navigate(['/app/chats', convo.id]);
      },
    });
  }

  getOtherParticipantLastMessage(thread: any): string {
    if (thread.lastMessageSenderId === this.session.currentUser()?.id) {
      return `You: ${thread.lastMessage}`;
    }
    return thread.lastMessage;
  }

  showProfile(userId: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    const cached = this.chat.getUserProfile(userId);
    if (cached) {
      this.selectedProfile.set(cached);
    } else {
      this.userService.getUser(userId).subscribe({
        next: (profile) => {
          this.chat.fetchAndCacheProfile(userId);
          this.selectedProfile.set(profile);
        },
      });
    }
  }

  closeProfile() {
    this.selectedProfile.set(null);
  }

  getProfileAvatar(): string {
    const p = this.selectedProfile();
    if (!p) return '?';
    return (p.displayName || p.username || '?').charAt(0).toUpperCase();
  }
}
