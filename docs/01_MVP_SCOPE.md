# Forge D6 Communicator – MVP Scope (Prototype)

## Goal
A secure, role-based university communicator organized by channels (faculty/modules/clubs/emergency).

## Roles
### Admin
- Create users and assign roles
- Create/manage channels
- Moderate (delete messages, mute/ban users)
- View audit log
- Send emergency alerts

### Academic Staff
- Create module channels (if permitted by Admin)
- Post announcements/resources/polls to owned channels
- Chat in owned channels
- Moderate in owned channels (if permitted)

### Student
- Join channels using join code (where allowed)
- View announcements/resources/calendar events in joined channels
- Chat in joined channels
- Vote in polls

## Channels
Types:
- FACULTY
- MODULE
- CLUB
- EMERGENCY

Channel visibility:
- PUBLIC: discoverable to authenticated users (or everyone if Forge wants)
- PRIVATE: join by code or admin assignment

## Communication Types
- Announcement (rich text + attachments, pin/unpin, edited metadata)
- Resource (file/link)
- Poll (single or multi choice, one vote per user)
- Emergency alert (admin-only posting, read-only for others)

## Must-have Prototype Features (All 12 included at prototype depth)
1. Push notifications: in-app realtime notifications + (optional) web push + email fallback
2. Personalized channels & roles: subscriptions/memberships + RBAC
3. Calendar: channel events + ICS export
4. Two-way messaging: channel chat + moderation
5. Document sharing: attachments/links
6. Secure auth + role permissions: enforced server-side
7. Search & archive: search announcements/messages/resources (MVP search)
8. Multi-platform: responsive web + PWA install
9. Feedback & polling: polls + results
10. Admin dashboard: users, channels, moderation, scheduling
11. Integrations: prototype stubs + CSV import (unless real access provided)
12. Emergency alerts: dedicated channel + priority UI

## Out of scope unless Forge demands it
- Full LMS features (grading, assignments, attendance)
- Full SIS/LMS integration with live credentials
- Native iOS/Android apps (PWA is the prototype mobile)
