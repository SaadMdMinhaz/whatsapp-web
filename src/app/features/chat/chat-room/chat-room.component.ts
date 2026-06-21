import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChatFacade } from '../../../core/services/chat.facade';

@Component({
  selector: 'app-chat-room',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './chat-room.component.html',
  styleUrl: './chat-room.component.scss'
})
export class ChatRoomComponent {
  private readonly route = inject(ActivatedRoute);
  readonly chat = inject(ChatFacade);

  readonly draft = signal('');
  readonly threadId = computed(() => this.route.snapshot.paramMap.get('chatId') ?? 'c1');
  readonly thread = computed(() => this.chat.getThread(this.threadId()));
  readonly messages = computed(() => this.chat.getMessages(this.threadId()));
  readonly threads = this.chat.activeThreads;

  send(): void {
    const message = this.draft().trim();
    if (!message) {
      return;
    }
    this.chat.sendMessage(this.threadId(), message);
    this.draft.set('');
  }

  updateDraft(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }
}
