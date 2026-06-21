import { Component, inject } from '@angular/core';
import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent {
  private readonly session = inject(SessionService);
  readonly user = this.session.currentUser;
}
