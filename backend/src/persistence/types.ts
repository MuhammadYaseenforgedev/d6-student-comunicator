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
  moduleId?: string | null;
  moduleCode?: string | null;
  moduleName?: string | null;
  courseId?: string | null;
  courseCode?: string | null;
  courseName?: string | null;
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

export type EditableCalendarEntry = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  courseId: string | null;
};

/* =========
   Finance
   ========= */

export type FinanceSummary = {
  userId: string;
  balanceCents: number;
  currency: string;
  accountStatus: string;
  statusNote: string | null;
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

export type FinanceDocument = {
  id: string;
  userId: string;
  type: string;
  title: string;
  description: string | null;
  amountCents: number | null;
  currency: string;
  issuedAt: string;
  documentUrl: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type FinanceStatusNotification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  severity: string;
  createdBy: string | null;
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

export type NotificationDeliveryChannel = "WHATSAPP";

export type NotificationDeliveryStatus =
  | "PENDING"
  | "SKIPPED"
  | "DRY_RUN"
  | "SENT"
  | "FAILED"
  | "DELIVERED";

export type NotificationDeliveryProvider = "none" | "twilio" | "meta";

export type UserContactPreference = {
  id: string;
  userId: string;
  whatsappPhoneE164: string | null;
  whatsappEnabled: boolean;
  whatsappOptedInAt: string | null;
  whatsappOptedOutAt: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationDelivery = {
  id: string;
  notificationId: string | null;
  userId: string;
  channel: NotificationDeliveryChannel;
  provider: NotificationDeliveryProvider;
  templateName: string | null;
  status: NotificationDeliveryStatus;
  providerMessageId: string | null;
  errorCode: string | null;
  attemptedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateNotificationDeliveryAttemptInput = {
  notificationId?: string | null;
  userId: string;
  channel: NotificationDeliveryChannel;
  provider: NotificationDeliveryProvider;
  templateName?: string | null;
  status?: NotificationDeliveryStatus;
  providerMessageId?: string | null;
  errorCode?: string | null;
  attemptedAt?: string | null;
  deliveredAt?: string | null;
};

export type UpdateNotificationDeliveryStatusInput = {
  status: NotificationDeliveryStatus;
  providerMessageId?: string | null;
  errorCode?: string | null;
  attemptedAt?: string | null;
  deliveredAt?: string | null;
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
  moduleId?: string | null;
  title: string;
  body: string;
  pinned?: boolean;
  createdBy: string;
  expiresAt?: string;
};

export type UpdateAnnouncementInput = {
  id: string;
  channelId: string;
  title?: string;
  body?: string;
  pinned?: boolean;
  expiresAt?: string;
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
  moduleId?: string | null;
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
  listByChannel(
    channelId: string,
    opts?: {
      includeExpired?: boolean;
    }
  ): Promise<Announcement[]>;
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
    opts?: {
      limit?: number;
      date?: string;
      start?: string;
      end?: string;
      role?: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";
    }
  ): Promise<CalendarEntry[]>;
  createForUser(
    userId: string,
    input: {
      title: string;
      description?: string | null;
      location?: string | null;
      startsAt: string;
      endsAt: string;
      courseId?: string | null;
    }
  ): Promise<CalendarEntry>;
  getEditableForUser(
    userId: string,
    entryId: string,
    role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT"
  ): Promise<EditableCalendarEntry | null>;
  updateForUser(
    userId: string,
    entryId: string,
    role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT",
    input: {
      title: string;
      description?: string | null;
      location?: string | null;
      startsAt: string;
      endsAt: string;
      courseId?: string | null;
    }
  ): Promise<CalendarEntry | null>;
  deleteForUser(
    userId: string,
    entryId: string,
    role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT"
  ): Promise<boolean>;
};

/* =========
   ✅ FIXED: FinanceRepo now matches your pgFinanceRepo
   listTransactions returns an array in your implementation
   ========= */

export type FinanceRepo = {
  ensureAccount(userId: string): Promise<void>;
  getSummary(userId: string): Promise<FinanceSummary>;
  updateAccount(
    userId: string,
    input: {
      balanceCents?: number;
      currency?: string;
      accountStatus?: string;
      statusNote?: string | null;
    }
  ): Promise<FinanceSummary>;
  listTransactions(
    userId: string,
    opts?: { limit?: number; before?: string }
  ): Promise<FinanceTransaction[]>;
  createTransaction(
    userId: string,
    input: {
      amountCents: number;
      currency?: string;
      description: string;
      occurredAt?: string;
    }
  ): Promise<FinanceTransaction>;
  listDocuments(userId: string, opts?: { limit?: number }): Promise<FinanceDocument[]>;
  createDocument(
    userId: string,
    input: {
      type: string;
      title: string;
      description?: string | null;
      amountCents?: number | null;
      currency?: string;
      issuedAt?: string;
      documentUrl?: string | null;
      createdBy?: string | null;
    }
  ): Promise<FinanceDocument>;
  listNotifications(userId: string, opts?: { limit?: number }): Promise<FinanceStatusNotification[]>;
  createNotification(
    userId: string,
    input: {
      title: string;
      body: string;
      severity?: string;
      createdBy?: string | null;
    }
  ): Promise<FinanceStatusNotification>;
};

export type NotificationRepo = {
  listForUser(userId: string, opts?: NotificationListOptions): Promise<NotificationListResult>;
  getUnreadSummary(userId: string): Promise<NotificationSummary>;
  createMany(inputs: CreateNotificationInput[]): Promise<Notification[]>;
  upsert(input: CreateNotificationInput & { sourceKey: string }): Promise<Notification>;
  markRead(userId: string, notificationId: string): Promise<boolean>;
  markAllRead(userId: string, categories?: NotificationCategory[]): Promise<number>;
};

export type NotificationDeliveryRepo = {
  getContactPreferenceForUser(userId: string): Promise<UserContactPreference | null>;
  isWhatsAppOptedIn(userId: string): Promise<boolean>;
  createDeliveryAttempt(input: CreateNotificationDeliveryAttemptInput): Promise<NotificationDelivery>;
  updateDeliveryStatus(
    id: string,
    input: UpdateNotificationDeliveryStatusInput
  ): Promise<NotificationDelivery | null>;
  listDeliveriesForNotification(notificationId: string): Promise<NotificationDelivery[]>;
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
  notificationDeliveries: NotificationDeliveryRepo;
};
