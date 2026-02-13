import type { Channel, ChannelType } from "../models/channel";
import type { Announcement } from "../models/announcement";
import type { Message } from "../models/message";
import type { Event } from "../models/event";

/* =========
   Uploads model (inline for now)
   ========= */

export type UploadKind = "LECTURER_MATERIAL" | "STUDENT_SUBMISSION";

export type Upload = {
  id: string;
  kind: UploadKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedBy: string;
  createdAt: string;
};

/* =========
   Parent Links model (inline for now)
   ========= */

export type ParentChild = {
  id: string;
  email: string;
};

/* =========
   Threads model (inline for now)
   ========= */

export type ThreadParticipant = { email: string };

export type Thread = {
  id: string;
  participants: ThreadParticipant[];
  lastMessageAt: string | null;
};

export type ThreadMessage = {
  id: string;
  threadId: string;
  body: string;
  createdBy: string;
  createdAt: string;
};

/* =========
   Inputs
   ========= */

export type CreateChannelInput = {
  name: string;
  type: ChannelType;
  isPrivate?: boolean;
  createdBy: string;
};

export type CreateAnnouncementInput = {
  channelId: string;
  title: string;
  body: string;
  pinned?: boolean;
  createdBy: string;
};

export type CreateMessageInput = {
  channelId: string;
  body: string;
  createdBy: string;
};

export type CreateEventInput = {
  channelId: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  createdBy: string;
};

export type UpdateEventInput = {
  eventId: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  startsAt?: string;
  endsAt?: string;
};

export type CreateUploadInput = {
  kind: UploadKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedBy: string;
};

/* =========
   Repos (ASYNC)
   ========= */

export type ChannelRepo = {
  list(): Promise<Channel[]>;
  create(input: CreateChannelInput): Promise<Channel>;
  join(channelId: string, userId: string): Promise<Channel | null>;
};

export type AnnouncementRepo = {
  listByChannel(channelId: string): Promise<Announcement[]>;
  create(input: CreateAnnouncementInput): Promise<Announcement>;
};

export type MessageRepo = {
  listByChannel(channelId: string): Promise<Message[]>;
  create(input: CreateMessageInput): Promise<Message>;
  delete(messageId: string): Promise<boolean>;
};

export type EventRepo = {
  listByChannel(channelId: string): Promise<Event[]>;
  create(input: CreateEventInput): Promise<Event>;
  update(input: {
    eventId: string;
    title?: string;
    description?: string | null;
    location?: string | null;
    startsAt?: string;
    endsAt?: string;
  }): Promise<Event | null>;
  delete(eventId: string): Promise<boolean>;
};

export type UploadRepo = {
  listForUser(user: { id: string; role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT" }): Promise<Upload[]>;
  create(input: CreateUploadInput): Promise<Upload>;
  getById(id: string): Promise<Upload | null>;
};

export type ParentLinksRepo = {
  listChildren(parentUserId: string): Promise<ParentChild[]>;
  linkChildByEmail(parentUserId: string, studentEmail: string): Promise<{ created: boolean; child: ParentChild | null }>;
  unlinkChild(parentUserId: string, studentUserId: string): Promise<boolean>;
};

export type ThreadRepo = {
  listForUser(userId: string): Promise<Thread[]>;
  createThread(createdBy: string, participantEmails: string[]): Promise<Thread>;
  listMessages(threadId: string, userId: string): Promise<ThreadMessage[]>;
  createMessage(threadId: string, userId: string, body: string): Promise<ThreadMessage>;
};

/* =========
   Repos Container
   ========= */

export type Repos = {
  channels: ChannelRepo;
  announcements: AnnouncementRepo;
  messages: MessageRepo;
  events: EventRepo;
  uploads: UploadRepo;
  parentLinks: ParentLinksRepo;
  threads: ThreadRepo;
};
