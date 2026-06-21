import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../../core/services/session.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  name = 'Ayaan Khan';
  email = 'user@connectly.dev';
  password = 'password';

  constructor(private readonly session: SessionService) {}

  submit(): void {
    this.session.register(this.name, this.email);
  }
}
