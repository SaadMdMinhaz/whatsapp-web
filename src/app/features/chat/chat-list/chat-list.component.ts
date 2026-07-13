import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChatFacade } from '../../../core/services/chat.facade';
import { UserService } from '../../../core/services/user.service';
import { SessionService } from '../../../core/services/session.service';
import { UserProfileResponse } from '../../../core/services/user.service';

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

  readonly query = signal('');
  readonly showNewChat = signal(false);
  readonly searchQuery = signal('');
  readonly searchResults = signal<UserProfileResponse[]>([]);

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
    this.searchQuery.set('');
    this.searchResults.set([]);
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
        this.chat.loadConversations();
      },
    });
  }

  getOtherParticipantLastMessage(thread: any): string {
    if (thread.lastMessageSenderId === this.session.currentUser()?.id) {
      return `You: ${thread.lastMessage}`;
    }
    return thread.lastMessage;
  }
}
