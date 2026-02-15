# API Contract (Prototype)

---

## Auth

- POST /auth/login  
- POST /auth/logout  
- GET /me  

---

## Channels

- GET /channels              # list channels user can see  
- POST /channels             # admin/lecturer create (rules apply)  
- POST /channels/join        # join by code  
- GET /channels/:id          # channel details + permissions  

---

## Posts (Announcements / Resources / Polls / Emergency)

- GET /channels/:id/posts  
- POST /channels/:id/posts  
- PATCH /posts/:id            # edit, pin/unpin, schedule  
- POST /posts/:id/attachments # upload or link  
- GET /posts/:id/attachments  

---

## Messages

- GET /channels/:id/messages  
- POST /channels/:id/messages  
- DELETE /messages/:id        # moderator/admin  
- POST /messages/:id/report  

---

## Calendar

- GET /channels/:id/events  
- POST /channels/:id/events  
- GET /calendar/ics?channelId=...  

---

## Polls

- POST /polls/:postId/vote  
- GET /polls/:postId/results  

---

## Search

- GET /search?q=...&type=posts|messages|resources&channelId=...  

---

## Admin

- GET /admin/users  
- POST /admin/users  
- PATCH /admin/users/:id/role  
- GET /admin/audit  
- POST /admin/moderation/mute  
- POST /admin/moderation/ban  
- POST /admin/moderation/unmute  
- POST /admin/moderation/unban  

---

## Realtime (WebSockets or service)

### Events

- post.created  
- post.updated  
- message.created  
- notification.created  
- emergency.sent  

---

## D6 Student Communicator – API Contract (Week 2)

Base URL:

- dev: <http://localhost:3000/api>

---

## Announcements

### GET /announcements?channel={channelKey}

Returns announcements (optionally filtered by channel).

Response: 200

```json
[
  {
    "id": "string",
    "channel": "general|modules|faculty|clubs|emergency",
    "title": "string",
    "body": "string",
    "pinned": true,
    "author": "string",
    "createdAt": "ISO string"
  }
]
