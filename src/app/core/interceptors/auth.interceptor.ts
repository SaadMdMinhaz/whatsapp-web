import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { SessionService } from '../services/session.service';

let isRefreshing = false;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const token = session.accessToken();

  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(req).pipe(
    catchError((error) => {
      if (error.status === 401 && token && !isRefreshing) {
        isRefreshing = true;
        const refreshToken = session.refreshToken();

        if (refreshToken) {
          return session.refreshAccessToken().pipe(
            switchMap((newToken) => {
              isRefreshing = false;
              const cloned = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` },
              });
              return next(cloned);
            }),
            catchError(() => {
              isRefreshing = false;
              session.logout();
              return throwError(() => error);
            })
          );
        } else {
          isRefreshing = false;
          session.logout();
        }
      }
      return throwError(() => error);
    })
  );
};
