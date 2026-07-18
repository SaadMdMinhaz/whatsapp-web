import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../../core/services/session.service';
import { ChatFacade } from '../../core/services/chat.facade';
import { CallOverlayComponent } from '../call/call-overlay.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, CallOverlayComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly session = inject(SessionService);
  private readonly chat = inject(ChatFacade);

  readonly user = this.session.currentUser;

  ngOnInit() {
    const token = this.session.accessToken();
    if (token && !this.session.isWebSocketConnected()) {
      this.session.connectWebSocket(token);
    }
    this.chat.loadConversations();
  }

  logout() {
    this.session.logout();
  }
}
