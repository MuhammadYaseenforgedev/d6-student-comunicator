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

export type ThreadListOptions = {
  limit?: number;
  before?: string;
};

export type ThreadListResult = {
  threads: Thread[];
  nextBefore: string | null;
};

export type ThreadMessageListResult = {
  messages: ThreadMessage[];
  nextBefore: string | null;
};

/* =========
   Calendar model (inline for now)
   ========= */

export type CalendarEntry = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

/* =========
   Finance model (inline for now)
   ========= */

export type FinanceSummary = {
  userId: string;
  balanceCents: number;
  currency: string;
  updatedAt: string;
};

export type FinanceTransaction = {
  id: string;
  userId: string;
  amountCents: number;
  currency: string;
  description: string;
  occurredAt: string;
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
  listForUser(user: {
    id: string;
    role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";
  }): Promise<Upload[]>;
  create(input: CreateUploadInput): Promise<Upload>;
  getById(id: string): Promise<Upload | null>;
};

export type ParentLinksRepo = {
  listChildren(parentUserId: string): Promise<ParentChild[]>;
  linkChildByEmail(
    parentUserId: string,
    studentEmail: string
  ): Promise<{ created: boolean; child: ParentChild | null }>;
  unlinkChild(parentUserId: string, studentUserId: string): Promise<boolean>;
};

export type ThreadRepo = {
  // matches GET /threads?limit=&before=
  listForUser(userId: string, opts?: ThreadListOptions): Promise<ThreadListResult>;

  // matches GET /threads/:id
  getByIdForUser(threadId: string, userId: string): Promise<Thread>;

  // matches POST /threads returning { created, thread }
  createThread(
    createdBy: string,
    participantEmails: unknown
  ): Promise<{ created: boolean; thread: Thread }>;

  // matches GET /threads/:id/messages?limit=&before=
  listMessages(
    threadId: string,
    userId: string,
    opts?: ThreadListOptions
  ): Promise<ThreadMessageListResult>;

  // matches POST /threads/:id/messages
  createMessage(
    threadId: string,
    userId: string,
    body: unknown
  ): Promise<ThreadMessage>;
};

export type CalendarRepo = {
  listForUser(userId: string, opts?: { limit?: number }): Promise<CalendarEntry[]>;
  createForUser(
    userId: string,
    input: {
      title: string;
      description?: string | null;
      location?: string | null;
      startsAt: string;
      endsAt: string;
    }
  ): Promise<CalendarEntry>;
};

export type FinanceRepo = {
  ensureAccount(userId: string): Promise<void>;
  getSummary(userId: string): Promise<FinanceSummary>;
  listTransactions(userId: string, opts?: { limit?: number }): Promise<FinanceTransaction[]>;
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
  calendar: CalendarRepo;
  finance: FinanceRepo;
};
