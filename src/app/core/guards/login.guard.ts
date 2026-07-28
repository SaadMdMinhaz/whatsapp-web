import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../services/session.service';

export const loginGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  return session.accessToken() ? router.createUrlTree(['/app/chats']) : true;
};
