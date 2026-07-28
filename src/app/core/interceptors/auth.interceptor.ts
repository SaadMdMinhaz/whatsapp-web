import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { SessionService } from '../services/session.service';

let isRefreshing = false;
const refreshSubject = new BehaviorSubject<string | null>(null);

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
      if (error.status !== 401 || !token) {
        return throwError(() => error);
      }

      if (isRefreshing) {
        return refreshSubject.pipe(
          filter((t) => t !== null),
          take(1),
          switchMap((t) => {
            const cloned = req.clone({
              setHeaders: { Authorization: `Bearer ${t}` },
            });
            return next(cloned);
          })
        );
      }

      isRefreshing = true;
      refreshSubject.next(null);
      const rt = session.refreshToken();

      if (!rt) {
        isRefreshing = false;
        session.logout();
        return throwError(() => error);
      }

      return session.refreshAccessToken().pipe(
        switchMap((newToken) => {
          isRefreshing = false;
          refreshSubject.next(newToken.accessToken);
          const cloned = req.clone({
            setHeaders: { Authorization: `Bearer ${newToken.accessToken}` },
          });
          return next(cloned);
        }),
        catchError(() => {
          isRefreshing = false;
          refreshSubject.next(null);
          session.logout();
          return throwError(() => error);
        })
      );
    })
  );
};
