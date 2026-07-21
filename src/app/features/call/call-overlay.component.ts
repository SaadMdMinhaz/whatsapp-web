import { Component, effect, inject, viewChild, ElementRef, computed } from '@angular/core';
import { CallService } from '../../core/services/call.service';

@Component({
  selector: 'app-call-overlay',
  standalone: true,
  templateUrl: './call-overlay.component.html',
  styleUrl: './call-overlay.component.scss',
})
export class CallOverlayComponent {
  readonly call = inject(CallService);
  private readonly remoteAudio = viewChild<ElementRef<HTMLAudioElement>>('remoteAudio');

  private ringAudio: HTMLAudioElement | null = null;

  readonly gridClass = computed(() => {
    const count = this.call.state().participants.length + 1;
    if (count <= 2) return '2';
    if (count <= 4) return '4';
    if (count <= 6) return '6';
    return '9';
  });

  constructor() {
    effect(() => {
      const stream = this.call.remoteStream();
      const kind = this.call.state().kind;
      const audioEl = this.remoteAudio()?.nativeElement;
      if (stream && kind === 'audio' && audioEl) {
        audioEl.srcObject = stream;
        audioEl.play().catch(() => {});
      }
    });

    effect(() => {
      const status = this.call.state().status;
      if (status === 'incoming' || status === 'outgoing') {
        this.startRing(status === 'incoming');
      } else {
        this.stopRing();
      }
    });
  }

  accept() {
    this.call.acceptCall();
  }

  reject() {
    this.call.rejectCall();
  }

  hangup() {
    this.call.endCall();
  }

  toggleMic() {
    this.call.toggleMic();
  }

  toggleCamera() {
    this.call.toggleCamera();
  }

  private startRing(incoming: boolean) {
    if (this.ringAudio) return;
    const audio = new Audio(this.buildTone(incoming));
    audio.loop = true;
    audio.volume = 0.4;
    audio.play().catch(() => {});
    this.ringAudio = audio;
  }

  private stopRing() {
    if (this.ringAudio) {
      this.ringAudio.pause();
      this.ringAudio.currentTime = 0;
      this.ringAudio = null;
    }
  }

  private buildTone(incoming: boolean): string {
    const sampleRate = 8000;
    const durationSec = incoming ? 2 : 1.5;
    const freq = incoming ? 480 : 440;
    const total = Math.floor(sampleRate * durationSec);
    const bytesPerSample = 2;
    const dataSize = total * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    const onFor = Math.floor(sampleRate * (incoming ? 1 : 1));
    for (let i = 0; i < total; i++) {
      const gate = i < onFor ? 1 : 0;
      const sample = gate * Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5;
      view.setInt16(44 + i * 2, sample * 0x7fff, true);
    }

    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return 'data:audio/wav;base64,' + btoa(binary);
  }
}
