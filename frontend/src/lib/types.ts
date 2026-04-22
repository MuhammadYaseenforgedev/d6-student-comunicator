// src/lib/types.ts
// Central app types used across pages/stores/hooks.

// ---------- Announcements ----------
export type ChannelKey = "general" | "modules" | "faculty" | "clubs" | "emergency";

export type Announcement = {
  id: string;
  channel: ChannelKey;
  title: string;
  body: string;
  pinned: boolean;
  author: string;
  createdAt: string; // ISO string
  expiresAt?: string | null;
  moduleId?: string | null;
  moduleCode?: string | null;
  moduleName?: string | null;
};

export type AnnouncementCreate = {
  channel: ChannelKey;
  title: string;
  body: string;
  pinned: boolean;
  author: string;
  expiresAt: string;
  moduleId?: string | null;
};

// ---------- Messaging ----------
export type Thread = {
  id: string;
  title: string;
  participants: string[]; // emails
  lastMessageAt: string; // ISO
};

export type Message = {
  id: string;
  threadId: string;
  sender: string; // email
  body: string;
  createdAt: string; // ISO
};

export type MessageCreate = {
  threadId: string;
  body: string;
};

// ---------- Auth / Roles ----------
// Keep UserRole here so stores/pages can depend on it without importing from auth.ts.
export type UserRole = "STUDENT" | "LECTURER" | "ADMIN" | "PARENT";

// ---------- Uploads ----------
export type UploadKind = "LECTURER_MATERIAL" | "STUDENT_SUBMISSION";

// NOTE: You used UploadScope earlier in UploadModal. Keep it for compatibility.
export type UploadScope = UploadKind;

export type UploadRecord = {
  id: string;
  kind: UploadKind;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string; // base64 data URL
  uploadedAt: string; // ISO
  uploaderEmail: string;
  uploaderRole: UserRole;
  targetUserId?: string | null;
  targetUserEmail?: string | null;
  targetUserRole?: UserRole | null;
  moduleId?: string | null;
  moduleCode?: string | null;
  moduleName?: string | null;
  courseId?: string | null;
  courseCode?: string | null;
  courseName?: string | null;
};

// ---------- Calendar ----------
export type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  // Date-only ISO format: "YYYY-MM-DD" (keeps the UI simple and predictable)
  date: string;
  // Optional tags like "EXAM", "HOLIDAY", "ASSESSMENT"
  category?: "EXAM" | "ASSESSMENT" | "HOLIDAY" | "GENERAL";
  createdAt: string; // ISO
  createdBy: string; // email
  createdByRole: UserRole;
};

export type StudentCalendarNote = {
  id: string;
  // Notes can be attached to a date or to an event
  date: string; // "YYYY-MM-DD"
  eventId?: string;
  body: string;
  ownerEmail: string; // student email
  createdAt: string; // ISO
};

// ---------- Parent Finance ----------
export type AccountStatus = "PAID" | "OUTSTANDING" | "OVERDUE";

export type FinanceNotification = {
  id: string;
  parentEmail: string;
  status: AccountStatus;
  message: string;
  createdAt: string; // ISO
};

export type FinanceDocument = {
  id: string;
  parentEmail: string;
  title: string; // e.g. "Statement - Jan 2026"
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string; // base64 data URL
  uploadedAt: string; // ISO
  uploadedBy: string; // email (admin/campus)
};

// =======================================================
// ✅ NEW: Parent-child linking + admin approval (manager request)
// =======================================================

/**
 * Parent requests to link a child using child ID (not email).
 * Admin approves/rejects the request.
 */
export type LinkRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type ParentChildLinkRequest = {
  id: string;
  parentUserId: string;
  parentEmail: string;
  childCampusId: string; // ✅ child ID used for linking
  status: LinkRequestStatus;
  createdAt: string; // ISO
  decidedAt?: string; // ISO
  decidedBy?: string; // admin user/email
  note?: string; // rejection reason etc
};

/**
 * Approved link.
 * This is what the parent portal uses to show linked children.
 */
export type LinkedChild = {
  id: string;
  childUserId: string;
  childCampusId: string;
  childName?: string; // optional
};
