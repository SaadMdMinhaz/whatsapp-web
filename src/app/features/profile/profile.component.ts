import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../core/services/session.service';
import { UserService, UserProfileResponse } from '../../core/services/user.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  private readonly session = inject(SessionService);
  private readonly userService = inject(UserService);

  readonly user = this.session.currentUser;
  readonly saving = signal(false);
  readonly message = signal('');

  displayName = '';
  about = '';
  phoneNumber = '';
  username = '';

  ngOnInit() {
    const u = this.user();
    if (u) {
      this.userService.getUser(u.id).subscribe({
        next: (profile) => {
          this.displayName = profile.displayName || '';
          this.about = profile.about || '';
          this.phoneNumber = profile.phoneNumber || '';
          this.username = profile.username || '';
        },
        error: () => {},
      });
    }
  }

  save() {
    const u = this.user();
    if (!u) return;
    this.saving.set(true);
    this.message.set('');
    this.userService.updateUser(u.id, { displayName: this.displayName, about: this.about }).subscribe({
      next: () => {
        this.message.set('Profile updated successfully');
        this.saving.set(false);
      },
      error: (err) => {
        this.message.set('Failed to update profile');
        this.saving.set(false);
      },
    });
  }

  logout() {
    this.session.logout();
  }
}
