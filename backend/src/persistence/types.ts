import type { Channel, ChannelType } from "../models/channel";
import type { Announcement } from "../models/announcement";
import type { Message } from "../models/message";
import type { Event } from "../models/event";

/* =========
   Uploads model
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
  uploadedByEmail?: string | null;
  uploadedByRole?: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT" | null;
  targetUserId?: string | null;
  targetUserEmail?: string | null;
  targetUserRole?: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT" | null;
  createdAt: string;
};

/* =========
   Parent Links
   ========= */

export type ParentChild = {
  id: string;
  email: string;
};

/* =========
   Threads
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
   Calendar
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
   Finance
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
   Notifications
   ========= */

export type NotificationCategory =
  | "MESSAGE"
  | "ANNOUNCEMENT"
  | "EMERGENCY"
  | "ATTENDANCE"
  | "RESULT"
  | "FINANCE"
  | "PARENT_LINK";

export type Notification = {
  id: string;
  userId: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  meta: Record<string, unknown>;
  sourceKey: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type CreateNotificationInput = {
  userId: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
  sourceKey?: string | null;
};

export type NotificationListOptions = {
  limit?: number;
  before?: string;
  unreadOnly?: boolean;
  categories?: NotificationCategory[];
};

export type NotificationListResult = {
  items: Notification[];
  nextBefore: string | null;
};

export type NotificationSummary = {
  totalUnread: number;
  counts: Partial<Record<NotificationCategory, number>>;
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

export type UpdateAnnouncementInput = {
  id: string;
  channelId: string;
  title?: string;
  body?: string;
  pinned?: boolean;
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
  targetUserId?: string | null;
};

/* =========
   Repo interfaces
   ========= */

export type ChannelRepo = {
  list(): Promise<Channel[]>;
  create(input: CreateChannelInput): Promise<Channel>;
  join(channelId: string, userId: string): Promise<Channel | null>;
};

export type AnnouncementRepo = {
  listByChannel(channelId: string): Promise<Announcement[]>;
  create(input: CreateAnnouncementInput): Promise<Announcement>;
  update(input: UpdateAnnouncementInput): Promise<Announcement | null>;
  delete(id: string, channelId: string): Promise<boolean>;
};

export type MessageRepo = {
  listByChannel(channelId: string): Promise<Message[]>;
  create(input: CreateMessageInput): Promise<Message>;
  delete(messageId: string): Promise<boolean>;
};

export type EventRepo = {
  listByChannel(channelId: string): Promise<Event[]>;
  create(input: CreateEventInput): Promise<Event>;
  update(input: UpdateEventInput): Promise<Event | null>;
  delete(eventId: string): Promise<boolean>;
};

export type UploadRepo = {
  listForUser(user: {
    id: string;
    role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";
  }): Promise<Upload[]>;
  create(input: CreateUploadInput): Promise<Upload>;
  getById(id: string): Promise<Upload | null>;
  delete(id: string): Promise<boolean>;
};

export type ParentLinksRepo = {
  listChildren(parentUserId: string): Promise<ParentChild[]>;
  linkChildByEmail(
    parentUserId: string,
    studentEmail: unknown
  ): Promise<{ created: boolean; child: ParentChild | null }>;
  unlinkChild(parentUserId: string, studentUserId: string): Promise<boolean>;
};

export type ThreadRepo = {
  listForUser(userId: string, opts?: ThreadListOptions): Promise<ThreadListResult>;
  getByIdForUser(threadId: string, userId: string): Promise<Thread>;
  createThread(
    createdBy: string,
    participantEmails: unknown
  ): Promise<{ created: boolean; thread: Thread }>;
  listMessages(
    threadId: string,
    userId: string,
    opts?: ThreadListOptions
  ): Promise<ThreadMessageListResult>;
  createMessage(threadId: string, userId: string, body: unknown): Promise<ThreadMessage>;
};

/* =========
   CalendarRepo matches your pgCalendarRepo
   ========= */

export type CalendarRepo = {
  listForUser(
    userId: string,
    opts?: { limit?: number }
  ): Promise<CalendarEntry[]>;
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

/* =========
   ✅ FIXED: FinanceRepo now matches your pgFinanceRepo
   listTransactions returns an array in your implementation
   ========= */

export type FinanceRepo = {
  ensureAccount(userId: string): Promise<void>;
  getSummary(userId: string): Promise<FinanceSummary>;
  listTransactions(
    userId: string,
    opts?: { limit?: number; before?: string }
  ): Promise<FinanceTransaction[]>;
};

export type NotificationRepo = {
  listForUser(userId: string, opts?: NotificationListOptions): Promise<NotificationListResult>;
  getUnreadSummary(userId: string): Promise<NotificationSummary>;
  createMany(inputs: CreateNotificationInput[]): Promise<void>;
  upsert(input: CreateNotificationInput & { sourceKey: string }): Promise<Notification>;
  markRead(userId: string, notificationId: string): Promise<boolean>;
  markAllRead(userId: string, categories?: NotificationCategory[]): Promise<number>;
};

/* =========
   Repos object shape
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
  notifications: NotificationRepo;
};
