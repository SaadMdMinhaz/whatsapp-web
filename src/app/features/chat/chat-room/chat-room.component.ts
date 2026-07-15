import { Component, computed, inject, signal, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LowerCasePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { ChatFacade } from '../../../core/services/chat.facade';
import { WebSocketService } from '../../../core/services/websocket.service';
import { SessionService } from '../../../core/services/session.service';
import { CallService } from '../../../core/services/call.service';
import { UserService, UserProfileResponse } from '../../../core/services/user.service';
import { MessageResponse, ConversationDetailResponse } from '../../../core/services/chat.service';

const EMOJI_LIST = ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😗','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😮','😯','😲','😳','🥺','😢','😭','😤','😠','😡','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😻','🙌','👏','👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','🤙','👋','🤚','✋','🖐','🖖','🫰','🫵','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','☸️','✡️','🔯','🕎','☯️','🦋','🌈','⭐','🌙','☀️','🔥','💧','🌊','🍕','🍔','🌮','🌯','🥗','🥪','🍱','🍣','🍦','🍩','🍪','☕','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧊','🥄','🍴','🥣','⚽','🏀','🏈','⚾','🎾','🏐','🏓','🥊','⛳','🎣','🚴','🏋️','🤸','🤼','🎮','🎯','🎲','♟️','🎭','🎨','🎵','🎶','🎤','🎧','🎸','🎹','🥁','🎷','🎺','🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🚂','✈️','🚀','🛸','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🗼','🗽','⛲','🌋','🏔️','⛰️','🌄','🌅','🌈','🎑','🏞️','🌇','🌆','🌃','🌉','🎆','🎇'];

@Component({
  selector: 'app-chat-room',
  standalone: true,
  imports: [RouterLink, FormsModule, LowerCasePipe, UpperCasePipe, DecimalPipe],
  templateUrl: './chat-room.component.html',
  styleUrl: './chat-room.component.scss',
})
export class ChatRoomComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly chat = inject(ChatFacade);
  private readonly wsService = inject(WebSocketService);
  private readonly session = inject(SessionService);
  private readonly userService = inject(UserService);
  readonly callService = inject(CallService);

  readonly draft = signal('');
  readonly showEmoji = signal(false);
  readonly showMenu = signal(false);
  readonly menuSection = signal<'main' | ''>('');
  readonly detail = signal<ConversationDetailResponse | null>(null);
  readonly memberProfiles = signal<UserProfileResponse[]>([]);
  readonly emojiList = EMOJI_LIST;

  readonly threadId = signal('');
  readonly thread = computed(() => this.chat.getThread(this.threadId()));
  readonly threads = this.chat.activeThreads;

  private typingTimeout: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('messageList') messageList!: ElementRef<HTMLElement>;

  ngOnInit() {
    this.callService.resetState();
    this.chat.loadConversations();

    this.route.paramMap.subscribe((params) => {
      const prevId = this.threadId();
      const newId = params.get('chatId') ?? '';

      if (prevId === newId) return;

      if (prevId) {
        this.wsService.unsubscribeFromConversation(prevId);
        this.callService.unsubscribeCallTopics(prevId);
      }

      this.chat.messages.set([]);
      this.draft.set('');
      this.showEmoji.set(false);
      this.showMenu.set(false);
      this.detail.set(null);
      this.memberProfiles.set([]);
      this.callService.resetState();
      this.threadId.set(newId);

      if (newId) {
        this.chat.loadMessages(newId);
        this.chat.markAsRead(newId);
        this.wsService.subscribeToConversation(newId, (msg: MessageResponse) => {
          this.chat.handleIncomingMessage(msg);
        });
        this.wsService.sendMarkRead(newId);
        this.callService.subscribeCallTopics(newId);
      }
    });
  }

  ngAfterViewChecked() {
    if (this.messageList) {
      this.messageList.nativeElement.scrollTop = this.messageList.nativeElement.scrollHeight;
    }
  }

  ngOnDestroy() {
    const id = this.threadId();
    if (id) {
      this.wsService.unsubscribeFromConversation(id);
      this.callService.unsubscribeCallTopics(id);
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

  insertEmoji(emoji: string) {
    this.draft.update((d) => d + emoji);
  }

  toggleEmoji() {
    this.showEmoji.update((v) => !v);
  }

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.chat.sendMediaMessage(this.threadId(), input.files[0]);
      input.value = '';
    }
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

  startAudioCall() {
    const convId = this.threadId();
    const otherUser = this.thread()?.otherUser;
    if (convId && otherUser) {
      this.callService.startCall(convId, otherUser.userId);
    }
  }

  startVideoCall() {
    this.startAudioCall();
  }

  endCall() {
    this.callService.endCall();
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  toggleMenu() {
    this.showMenu.update((v) => !v);
  }

  closeMenu() {
    this.showMenu.set(false);
  }

  viewContact() {
    const t = this.thread();
    if (!t) return;
    if (t.type === 'GROUP') {
      this.chat.getConversationDetail(t.id).subscribe({
        next: (detail) => {
          this.detail.set(detail);
          this.menuSection.set('main');
          this.showMenu.set(false);
          const ids = detail.participants.map((p) => p.userId);
          this.memberProfiles.set([]);
          for (const uid of ids) {
            this.userService.getUser(uid).subscribe({
              next: (profile) => {
                this.memberProfiles.update((prev) => {
                  if (prev.find((p) => p.id === uid)) return prev;
                  return [...prev, profile];
                });
              },
            });
          }
        },
      });
    } else {
      this.userService.getUser(t.otherUser.userId).subscribe({
        next: (profile) => {
          this.detail.set({
            id: t.id,
            type: 'DIRECT',
            participants: [{
              userId: profile.id,
              username: profile.username,
              displayName: profile.displayName,
              profilePictureUrl: profile.profilePictureUrl,
            }],
            createdAt: null,
            updatedAt: null,
          });
          this.memberProfiles.set([profile]);
          this.menuSection.set('main');
          this.showMenu.set(false);
        },
      });
    }
  }

  closeDetail() {
    this.detail.set(null);
    this.memberProfiles.set([]);
    this.menuSection.set('');
  }

  archiveChat() {
    const id = this.threadId();
    if (id) {
      this.chat.toggleArchive(id);
      this.showMenu.set(false);
      this.router.navigate(['/app/chats']);
    }
  }

  blockUser() {
    const t = this.thread();
    if (!t || t.type === 'GROUP') return;
    this.chat.blockUser(t.otherUser.userId).subscribe({
      next: () => {
        this.chat.deleteThread(t.id);
        this.showMenu.set(false);
        this.router.navigate(['/app/chats']);
      },
    });
  }

  deleteChat() {
    const id = this.threadId();
    if (id) {
      this.chat.deleteThread(id);
      this.showMenu.set(false);
      this.router.navigate(['/app/chats']);
    }
  }

  clearMessages() {
    const id = this.threadId();
    if (id) {
      this.chat.clearMessages(id);
      this.showMenu.set(false);
    }
  }

  getMemberName(userId: string): string {
    const profile = this.memberProfiles().find((p) => p.id === userId);
    return profile?.displayName || profile?.username || userId;
  }

  getMemberStatus(userId: string): string {
    const profile = this.memberProfiles().find((p) => p.id === userId);
    return profile?.about || (this.chat.onlineUserIds().has(userId) ? 'online' : 'offline');
  }
}
