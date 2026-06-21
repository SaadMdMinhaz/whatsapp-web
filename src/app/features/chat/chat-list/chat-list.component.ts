import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChatFacade } from '../../../core/services/chat.facade';

type InboxTab = 'chats' | 'status' | 'calls';

@Component({
  selector: 'app-chat-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './chat-list.component.html',
  styleUrl: './chat-list.component.scss'
})
export class ChatListComponent {
  readonly chat = inject(ChatFacade);
  readonly query = signal('');
  readonly activeTab = signal<InboxTab>('chats');
  readonly archived = this.chat.archivedThreads;
  readonly stories = this.chat.stories;

  readonly threads = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.chat.activeThreads().filter((thread) => thread.title.toLowerCase().includes(term));
  });

  setTab(tab: InboxTab): void {
    this.activeTab.set(tab);
  }

  updateSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
