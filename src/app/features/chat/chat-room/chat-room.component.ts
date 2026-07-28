import { Component, computed, inject, signal, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LowerCasePipe, DecimalPipe, UpperCasePipe, DatePipe } from '@angular/common';
import { ChatFacade } from '../../../core/services/chat.facade';
import { WebSocketService } from '../../../core/services/websocket.service';
import { SessionService } from '../../../core/services/session.service';
import { CallService } from '../../../core/services/call.service';
import { MediaService } from '../../../core/services/media.service';
import { UserService, UserProfileResponse } from '../../../core/services/user.service';
import { MessageResponse, ConversationDetailResponse } from '../../../core/services/chat.service';

const EMOJI_LIST = ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😗','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😮','😯','😲','😳','🥺','😢','😭','😤','😠','😡','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😻','🙌','👏','👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','🤙','👋','🤚','✋','🖐','🖖','🫰','🫵','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','☸️','✡️','🔯','🕎','☯️','🦋','🌈','⭐','🌙','☀️','🔥','💧','🌊','🍕','🍔','🌮','🌯','🥗','🥪','🍱','🍣','🍦','🍩','🍪','☕','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧊','🥄','🍴','🥣','⚽','🏀','🏈','⚾','🎾','🏐','🏓','🥊','⛳','🎣','🚴','🏋️','🤸','🤼','🎮','🎯','🎲','♟️','🎭','🎨','🎵','🎶','🎤','🎧','🎸','🎹','🥁','🎷','🎺','🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🚂','✈️','🚀','🛸','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🗼','🗽','⛲','🌋','🏔️','⛰️','🌄','🌅','🌈','🎑','🏞️','🌇','🌆','🌃','🌉','🎆','🎇'];

@Component({
  selector: 'app-chat-room',
  standalone: true,
  imports: [RouterLink, FormsModule, LowerCasePipe, UpperCasePipe, DecimalPipe, DatePipe],
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
  private readonly mediaService = inject(MediaService);
  readonly callService = inject(CallService);

  readonly draft = signal('');
  readonly showEmoji = signal(false);
  readonly showMenu = signal(false);
  readonly menuSection = signal<'main' | ''>('');
  readonly detail = signal<ConversationDetailResponse | null>(null);
  readonly memberProfiles = signal<UserProfileResponse[]>([]);
  readonly emojiList = EMOJI_LIST;
  readonly isRecording = signal(false);
  readonly recordingDuration = signal('0:00');
  readonly recordingError = signal('');
  readonly showAttachMenu = signal(false);
  readonly previewImageUrl = signal('');
  readonly waveBars = signal<number[]>(Array(30).fill(4));

  readonly threadId = signal('');
  readonly thread = computed(() => this.chat.getThread(this.threadId()));
  readonly threads = this.chat.activeThreads;
  readonly currentMessages = computed(() => {
    const id = this.threadId();
    if (!id) return [];
    return this.chat.sortedMessages().filter((m) => m.conversationId === id);
  });

  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordingChunks: Blob[] = [];
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private recordingSeconds = 0;
  private animFrameId: number | null = null;

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('cameraInput') cameraInput!: ElementRef<HTMLInputElement>;
  @ViewChild('galleryInput') galleryInput!: ElementRef<HTMLInputElement>;
  @ViewChild('docInput') docInput!: ElementRef<HTMLInputElement>;
  @ViewChild('messageList') messageList!: ElementRef<HTMLElement>;

  ngOnInit() {
    this.chat.loadConversations();

    this.route.paramMap.subscribe((params) => {
      const prevId = this.threadId();
      const newId = params.get('chatId') ?? '';

      if (prevId === newId) return;

      if (prevId) {
        this.chat.setActiveConversation('');
        this.wsService.unsubscribeFromConversation(prevId);
        this.chat.messages.update((msgs) => msgs.filter((m) => m.conversationId !== prevId));
      }

      this.draft.set('');
      this.showEmoji.set(false);
      this.showMenu.set(false);
      this.showAttachMenu.set(false);
      this.recordingError.set('');
      this.detail.set(null);
      this.memberProfiles.set([]);
      this.threadId.set(newId);

      if (newId) {
        this.chat.setActiveConversation(newId);
        this.chat.loadMessages(newId);
        this.chat.markAsRead(newId);
        this.wsService.subscribeToConversation(newId, (msg: MessageResponse) => {
          this.chat.handleIncomingMessage(msg);
        });
        this.wsService.sendMarkRead(newId);
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
      this.chat.setActiveConversation('');
      this.wsService.unsubscribeFromConversation(id);
    }
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
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
    this.showAttachMenu.set(false);
    this.fileInput.nativeElement.click();
  }

  triggerCameraInput() {
    this.showAttachMenu.set(false);
    this.cameraInput.nativeElement.click();
  }

  triggerGalleryInput() {
    this.showAttachMenu.set(false);
    this.galleryInput.nativeElement.click();
  }

  triggerDocInput() {
    this.showAttachMenu.set(false);
    this.docInput.nativeElement.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.chat.sendMediaMessage(this.threadId(), input.files[0]);
      input.value = '';
    }
    this.showAttachMenu.set(false);
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
    if (!convId) return;
    if (this.thread()?.type === 'GROUP') {
      this.chat.getConversationDetail(convId).subscribe({
        next: (detail) => {
          const memberIds = detail.participants.map((p) => p.userId);
          this.callService.startGroupCall(convId, memberIds, 'audio');
        },
      });
    } else {
      const otherUser = this.thread()?.otherUser;
      if (otherUser) {
        const profile = this.chat.getUserProfile(otherUser.userId);
        const name = profile?.displayName || profile?.username || otherUser.displayName || otherUser.username || 'User';
        this.callService.startCall(convId, otherUser.userId, name, 'audio');
      }
    }
  }

  startVideoCall() {
    const convId = this.threadId();
    if (!convId) return;
    if (this.thread()?.type === 'GROUP') {
      this.chat.getConversationDetail(convId).subscribe({
        next: (detail) => {
          const memberIds = detail.participants.map((p) => p.userId);
          this.callService.startGroupCall(convId, memberIds, 'video');
        },
      });
    } else {
      const otherUser = this.thread()?.otherUser;
      if (otherUser) {
        const profile = this.chat.getUserProfile(otherUser.userId);
        const name = profile?.displayName || profile?.username || otherUser.displayName || otherUser.username || 'User';
        this.callService.startCall(convId, otherUser.userId, name, 'video');
      }
    }
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

  getMediaUrl(mediaId: string): string {
    return this.mediaService.getDownloadUrl(mediaId);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  onMediaError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  openPreview(url: string) {
    this.previewImageUrl.set(url);
  }

  closePreview() {
    this.previewImageUrl.set('');
  }

  async downloadMedia(url: string, filename: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      window.open(url, '_blank');
    }
  }

  async startRecording() {
    this.recordingError.set('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });
      this.recordingChunks = [];
      this.recordingSeconds = 0;
      this.recordingDuration.set('0:00');

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordingChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();
        this.recordingTimer = null;
        this.animFrameId = null;

        const chunks = this.recordingChunks;
        this.recordingChunks = [];
        if (chunks.length === 0) return;

        const blob = new Blob(chunks, { type: this.mediaRecorder!.mimeType || 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        this.chat.sendMediaMessage(this.threadId(), file);
      };

      this.mediaRecorder.start();
      this.isRecording.set(true);

      this.recordingTimer = setInterval(() => {
        this.recordingSeconds++;
        const m = Math.floor(this.recordingSeconds / 60);
        const s = this.recordingSeconds % 60;
        this.recordingDuration.set(`${m}:${s.toString().padStart(2, '0')}`);
      }, 1000);

      const animate = () => {
        analyser.getByteFrequencyData(dataArray);
        const bars = Array.from({ length: 30 }, (_, i) => {
          const val = dataArray[i % dataArray.length] || 0;
          return Math.max(4, (val / 255) * 32);
        });
        this.waveBars.set(bars);
        this.animFrameId = requestAnimationFrame(animate);
      };
      animate();
    } catch (e) {
      console.error('Microphone access denied:', e);
      this.recordingError.set('Microphone access denied. Please allow mic access and try again.');
    }
  }

  stopRecording() {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.mediaRecorder.stop();
    this.isRecording.set(false);
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  cancelRecording() {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.recordingChunks = [];
    this.mediaRecorder.stop();
    this.isRecording.set(false);
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    this.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    this.mediaRecorder = null;
  }
}
