# API Contracts Draft

## Authentication

```http
POST /api/auth/login
POST /api/auth/register
POST /api/auth/refresh
POST /api/auth/logout
```

## Chat

```http
GET /api/chats
POST /api/chats/direct
POST /api/chats/groups
PATCH /api/chats/{chatId}/archive
PATCH /api/users/{userId}/block
```

## Messaging

```http
GET /api/chats/{chatId}/messages
POST /api/chats/{chatId}/messages
DELETE /api/messages/{messageId}
POST /api/messages/{messageId}/seen
```

## WebSocket Events

- `message.created`
- `message.delivered`
- `message.seen`
- `message.deleted`
- `typing.started`
- `typing.stopped`
- `presence.changed`
- `story.created`
- `notification.created`
