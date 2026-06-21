# Connectly Frontend Architecture

Connectly is an Angular 18 standalone application prepared for a WhatsApp-like real-time chat platform.

## Layers

- `core/models`: domain contracts for users, threads, messages, attachments, and story status.
- `core/services`: facades and future REST/WebSocket integration points.
- `core/guards`: route protection and future role-based authorization.
- `features/auth`: login and registration flows.
- `features/dashboard`: authenticated shell and navigation.
- `features/chat`: chat list, stories, archived chats, room, composer, attachments, voice notes, and message status UI.
- `features/profile`: profile and photo update surface.
- `features/settings`: dark mode, notifications, privacy, and preferences.
- `features/admin`: moderation dashboard and user blocking controls.

## Backend Integration Plan

- Auth Service: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`.
- User Service: `/api/users/me`, `/api/users/search`, `/api/users/{id}/photo`.
- Chat Service: `/api/chats`, `/api/chats/groups`, `/api/chats/{id}/archive`.
- Message Service: `/api/chats/{id}/messages`, `/api/messages/{id}/delete`.
- Real-time: STOMP channels such as `/topic/chats/{id}`, `/user/queue/notifications`, and `/topic/presence`.
