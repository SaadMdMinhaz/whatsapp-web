# Connectly — WhatsApp-like Web Client

[![Angular](https://img.shields.io/badge/Angular-18-DD0031?logo=angular)](https://angular.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Connectly is a full-featured real-time messaging web client styled like WhatsApp Web. It powers one-to-one and group chat, voice/video calls, media sharing, typing indicators, read receipts, and presence — all backed by a Spring Boot microservice ecosystem.

![Connectly Screenshot](https://via.placeholder.com/800x450?text=Connectly+Chat+UI)

---

## Features

- **Authentication** — Login, register, and JWT refresh with auto-token management
- **One-to-One Chat** — Real-time messaging with send/delivered/read status
- **Group Chat** — Create groups, add participants, manage conversations
- **Media Sharing** — Upload and share images, videos, documents, audio
- **Voice/Video Calls** — WebRTC-based peer-to-peer and group calls
- **Typing Indicators** — See when others are typing in real-time
- **Presence** — Online/offline status with live updates
- **Read Receipts** — Blue double-check marks when messages are seen
- **Contact Management** — Add, rename, and remove contacts
- **Profile & Settings** — Update display name, about, profile photo, privacy

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Angular 18 (standalone components) |
| **Language** | TypeScript 5.6 |
| **UI** | SCSS, Flexbox |
| **State** | Angular Signals |
| **Real-Time** | STOMP over SockJS |
| **HTTP** | Angular HttpClient, RxJS |
| **Build** | Angular CLI |
| **Auth** | JWT (access + refresh tokens) |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Browser (Angular)                   │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │ Auth UI │  │ Chat UI  │  │ Call UI (WebRTC)   │  │
│  └────┬────┘  └────┬─────┘  └────────┬───────────┘  │
│       │            │                  │              │
│  ┌────▼────────────▼──────────────────▼───────────┐  │
│  │          Core Services (REST + STOMP)          │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────┘
                       │
          ┌────────────┼────────────────┐
          ▼            ▼                ▼
    Auth :8080   User :8081      Gateway :8084 (WS)
          ┌────────────┼────────────────┐
          ▼            ▼                ▼
    Chat :8082    Media :8083      Redis (presence)
                       │
                  SQL Server
```

### Backend Microservices

| Service | Port | Description |
|---------|------|-------------|
| **Auth** | 8080 | Authentication, JWT tokens |
| **User** | 8081 | User profiles, contacts, privacy |
| **Chat** | 8082 | Conversations and messages |
| **Media** | 8083 | File upload and storage |
| **Gateway** | 8084 | WebSocket hub, presence, calls |

---

## Prerequisites

- **Node.js** 20+ and npm
- **Java** 21+ (JDK)
- **SQL Server** 2022
- **Redis** 7+
- One of the backend services running (see individual service READMEs)

---

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/SaadMdMinhaz/whatsapp-web.git
cd whatsapp-web
npm install
```

### 2. Configure

The proxy config (`proxy.conf.json`) forwards API calls to locally-running backends:

```json
{
  "/api/v1/auth/":  { "target": "http://localhost:8080" },
  "/api/v1/users/": { "target": "http://localhost:8081" },
  "/api/v1/chats/": { "target": "http://localhost:8082" },
  "/api/v1/media":  { "target": "http://localhost:8083" },
  "/api/v1/gateway/": { "target": "http://localhost:8084" },
  "/ws":            { "target": "http://localhost:8084", "ws": true }
}
```

### 3. Start Dev Server

```bash
npm start
```

Opens at `http://localhost:4200` (proxies API to ports 8080–8084).

---

## Docker

```bash
docker build -t connectly-frontend .
docker run -p 4200:4200 connectly-frontend
```

In production, the nginx container proxies API calls to Docker service names (`auth-server`, `user-service`, etc.). See the [docker-compose.yml](https://github.com/SaadMdMinhaz) at the repository root.

---

## Project Structure

```
src/
├── app/
│   ├── core/
│   │   ├── guards/           # Auth guards
│   │   ├── interceptors/     # JWT interceptor
│   │   ├── models/           # Domain types
│   │   └── services/         # Facades, HTTP, WebSocket
│   ├── features/
│   │   ├── auth/             # Login / Register
│   │   ├── chat/             # Chat list, room, composer
│   │   ├── contacts/         # Contact management
│   │   ├── dashboard/        # Authenticated shell
│   │   ├── profile/          # User profile
│   │   └── settings/         # App settings
│   └── app.routes.ts
├── environments/             # API base URLs
└── ...
```

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Contracts](docs/API-CONTRACTS.md)
- [Full Project Docs](https://github.com/SaadMdMinhaz/Connectly-Project-Documentation)

---

## Related Repositories

| Service | Repository |
|---------|-----------|
| Auth Service | [whatsapp-auth](https://github.com/SaadMdMinhaz/whatsapp-auth) |
| User Service | [user-service](https://github.com/SaadMdMinhaz/wharsapp-user-service) |
| Chat Service | [whatsapp-chat-service](https://github.com/SaadMdMinhaz/whatsapp-chat-service) |
| Media Service | [whatsapp-media-service](https://github.com/SaadMdMinhaz/whatsapp-media-service) |
| Gateway Service | [whatsapp-gateway-service](https://github.com/SaadMdMinhaz/whatsapp-gateway-service) |

---

## License

[MIT](LICENSE)
