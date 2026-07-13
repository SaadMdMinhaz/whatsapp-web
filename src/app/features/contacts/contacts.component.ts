import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserService, UserProfileResponse, ContactResponse } from '../../core/services/user.service';
import { SessionService } from '../../core/services/session.service';
import { ChatFacade } from '../../core/services/chat.facade';
import { Router } from '@angular/router';

@Component({
  selector: 'app-contacts',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './contacts.component.html',
  styleUrl: './contacts.component.scss',
})
export class ContactsComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly session = inject(SessionService);
  private readonly chat = inject(ChatFacade);
  private readonly router = inject(Router);

  readonly contacts = signal<(ContactResponse & { displayName?: string })[]>([]);
  readonly showAdd = signal(false);
  readonly searchQuery = signal('');
  readonly searchResults = signal<UserProfileResponse[]>([]);
  readonly loading = signal(true);

  ngOnInit() {
    this.loadContacts();
  }

  loadContacts() {
    this.loading.set(true);
    this.userService.getContacts().subscribe({
      next: (contacts) => {
        this.contacts.set(contacts);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  searchUsers(event: Event) {
    const q = (event.target as HTMLInputElement).value;
    this.searchQuery.set(q);
    if (q.length < 2) {
      this.searchResults.set([]);
      return;
    }
    const currentUserId = this.session.currentUser()?.id;
    this.userService.searchUsers(q).subscribe({
      next: (users) => this.searchResults.set(users.filter((u) => u.id !== currentUserId)),
    });
  }

  addContact(userId: string) {
    this.userService.addContact({ contactUserId: userId }).subscribe({
      next: () => {
        this.showAdd.set(false);
        this.searchQuery.set('');
        this.searchResults.set([]);
        this.loadContacts();
      },
    });
  }

  removeContact(contactId: string) {
    this.userService.deleteContact(contactId).subscribe({
      next: () => {
        this.contacts.update((c) => c.filter((item) => item.id !== contactId));
      },
    });
  }

  startChat(userId: string) {
    this.chat.createConversation(userId).subscribe({
      next: (convo) => {
        this.router.navigate(['/app/chats', convo.id]);
      },
    });
  }

  toggleAdd() {
    this.showAdd.update((v) => !v);
    this.searchQuery.set('');
    this.searchResults.set([]);
  }
}
