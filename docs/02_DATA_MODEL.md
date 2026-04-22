# Data Model (Stack-Agnostic)

## User
- id (UUID or INT)
- name
- email (unique)
- universityId (student/staff number, optional but recommended)
- role: ADMIN | LECTURER | STUDENT
- passwordHash OR externalAuthId
- createdAt

## Channel
- id
- type: FACULTY | MODULE | CLUB | EMERGENCY
- name
- description
- isPublic (boolean)
- joinCode (nullable, unique when not null)
- createdByUserId (nullable if system-created)
- createdAt

## Membership
- id
- channelId
- userId
- roleInChannel (optional: MODERATOR)
- joinedAt
Constraints:
- UNIQUE(channelId, userId)

## Post
Used for announcements/resources/polls/emergency.
- id
- channelId
- type: ANNOUNCEMENT | RESOURCE | POLL | EMERGENCY
- title
- body (rich text stored as HTML/Markdown)
- createdByUserId
- createdAt
- updatedAt (nullable)
- editedByUserId (nullable)
- isPinned (boolean default false)
- publishAt (nullable for scheduling)
- status: DRAFT | PUBLISHED (optional)

## Attachment
- id
- postId
- fileName
- fileType
- fileSize
- storageKey or url
- createdAt

## Message
- id
- channelId
- senderUserId
- body
- createdAt
- deletedAt (nullable)
- deletedByUserId (nullable)
- reportedCount (int default 0)

## ModerationAction
- id
- channelId (nullable)
- actionType: MUTE | BAN | DELETE_MESSAGE | UNMUTE | UNBAN
- targetUserId (nullable)
- targetMessageId (nullable)
- reason (nullable)
- createdByUserId
- createdAt

## CalendarEvent
- id
- channelId
- title
- description (nullable)
- startAt
- endAt
- createdByUserId
- createdAt

## PollOption
- id
- postId
- label

## PollVote
- id
- postId
- optionId
- userId
- createdAt
Constraints:
- UNIQUE(postId, userId)  # one vote per poll per user

## Notification
- id
- userId
- type: NEW_POST | NEW_MESSAGE | EMERGENCY | POLL_CREATED | EVENT_CREATED
- refType (POST|MESSAGE|EVENT)
- refId
- createdAt
- readAt (nullable)

## AuditLog
- id
- actorUserId
- action: USER_CREATED | ROLE_CHANGED | CHANNEL_CREATED | CHANNEL_UPDATED | POST_CREATED | POST_EDITED | POST_DELETED | EMERGENCY_SENT | MOD_ACTION
- meta (JSON/text)
- createdAt
