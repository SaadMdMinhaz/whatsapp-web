import { Component, computed, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LowerCasePipe, DecimalPipe } from '@angular/common';
import { ChatFacade } from '../../../core/services/chat.facade';
import { WebSocketService } from '../../../core/services/websocket.service';
import { SessionService } from '../../../core/services/session.service';
import { MessageResponse } from '../../../core/services/chat.service';

@Component({
  selector: 'app-chat-room',
  standalone: true,
  imports: [RouterLink, FormsModule, LowerCasePipe, DecimalPipe],
  templateUrl: './chat-room.component.html',
  styleUrl: './chat-room.component.scss',
})
export class ChatRoomComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  readonly chat = inject(ChatFacade);
  private readonly wsService = inject(WebSocketService);
  private readonly session = inject(SessionService);

  readonly draft = signal('');
  readonly typing = signal(false);

  readonly threadId = computed(() => this.route.snapshot.paramMap.get('chatId') ?? '');
  readonly thread = computed(() => this.chat.getThread(this.threadId()));
  readonly threads = this.chat.activeThreads;

  private typingTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    const id = this.threadId();
    if (id) {
      this.chat.loadMessages(id);
      this.chat.markAsRead(id);
      this.wsService.subscribeToConversation(id, (msg: MessageResponse) => {
        this.chat.handleIncomingMessage(msg);
      });
      this.wsService.sendMarkRead(id);
    }
  }

  ngOnDestroy() {
    const id = this.threadId();
    if (id) {
      this.wsService.unsubscribeFromConversation(id);
    }
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
  }

  send() {
    const message = this.draft().trim();
    if (!message) return;
    this.chat.sendMessage(this.threadId(), message);
    this.draft.set('');
    this.wsService.sendTyping(this.threadId(), false);
  }

  updateDraft(event: Event) {
    this.draft.set((event.target as HTMLTextAreaElement).value);
    this.wsService.sendTyping(this.threadId(), true);
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.wsService.sendTyping(this.threadId(), false);
    }, 2000);
  }

  isOwnMessage(senderId: string): boolean {
    return senderId === this.session.currentUser()?.id;
  }

  getSenderName(senderId: string): string {
    return this.chat.getUserDisplayName(senderId);
  }

  formatTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  }

  formatStatus(status: string): string {
    switch (status) {
      case 'READ': return 'seen';
      case 'DELIVERED': return 'delivered';
      default: return 'sent';
    }
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }
}
