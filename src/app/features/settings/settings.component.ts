import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  readonly darkMode = signal(false);
  readonly notifications = signal(true);

  toggleDarkMode(): void {
    this.darkMode.update((value) => !value);
    document.documentElement.classList.toggle('dark-theme', this.darkMode());
  }

  toggleNotifications(): void {
    this.notifications.update((value) => !value);
  }
}
