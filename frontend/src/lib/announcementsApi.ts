// src/lib/announcementsApi.ts
import { apiGet, apiPost } from "./api";

export type Announcement = {
  id: string;
  channelId: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt?: string;
};

type UnknownRow = Record<string, unknown>;

function toStr(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
  return false;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Some APIs return:
 *  - the row directly
 *  - { announcement: row }
 * This safely extracts the row without TS complaining about "in" on unknown.
 */
function pickAnnouncementRow(data: unknown): UnknownRow {
  if (isRecord(data) && "announcement" in data) {
    const maybe = data.announcement;
    if (isRecord(maybe)) return maybe as UnknownRow;
  }

  // fallback: treat the response itself as the row
  return (isRecord(data) ? (data as UnknownRow) : {}) as UnknownRow;
}

function normalizeAnnouncement(row: UnknownRow): Announcement {
  return {
    id: toStr(row.id),
    channelId: toStr(row.channelId ?? row.channel_id ?? row.channel ?? ""),
    title: toStr(row.title ?? ""),
    body: toStr(row.body ?? row.message ?? ""),
    pinned: toBool(row.pinned ?? false),
    createdAt:
      typeof row.createdAt === "string"
        ? row.createdAt
        : typeof row.created_at === "string"
          ? row.created_at
          : undefined,
  };
}

/**
 * Supports both possible mount styles:
 * - /api/channels/:id/announcements
 * - /channels/:id/announcements
 */
export async function listAnnouncements(channelId: string): Promise<Announcement[]> {
  try {
    const data = await apiGet<unknown>(`/api/channels/${channelId}/announcements`);
    return Array.isArray(data) ? data.map((r) => normalizeAnnouncement(r as UnknownRow)) : [];
  } catch {
    // fallback if your backend isn't under /api
    const data = await apiGet<unknown>(`/channels/${channelId}/announcements`);
    return Array.isArray(data) ? data.map((r) => normalizeAnnouncement(r as UnknownRow)) : [];
  }
}

export async function createAnnouncement(
  channelId: string,
  payload: { title: string; body: string; pinned?: boolean }
): Promise<Announcement> {
  try {
    const data = await apiPost<unknown>(`/api/channels/${channelId}/announcements`, payload);
    const row = pickAnnouncementRow(data);
    return normalizeAnnouncement(row);
  } catch {
    const data = await apiPost<unknown>(`/channels/${channelId}/announcements`, payload);
    const row = pickAnnouncementRow(data);
    return normalizeAnnouncement(row);
  }
}
