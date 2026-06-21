import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../../core/services/session.service';
import { ChatFacade } from '../../core/services/chat.facade';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly session = inject(SessionService);
  private readonly chat = inject(ChatFacade);

  readonly user = this.session.currentUser;
  readonly onlineCount = computed(() => this.chat.onlineUsers().length);

  logout(): void {
    this.session.logout();
  }
}
