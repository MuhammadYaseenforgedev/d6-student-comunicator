import { apiDelete, apiGet, apiPost } from "../lib/api";

export type CalendarEntry = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  channelId?: string | null;
  source?: "CALENDAR_ENTRY" | "CHANNEL_EVENT" | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (isRecord(data)) {
    const value = data["value"];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

function todayDateParam() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * For PARENT role: pass childId to view that child's calendar
 * For others: omit childId (backend ignores it anyway for non-parent)
 */
export async function listCalendar(params?: {
  date?: string;
  limit?: number;
  childId?: string;
}): Promise<CalendarEntry[]> {
  const qs = new URLSearchParams();

  qs.set("date", params?.date ?? todayDateParam());

  const limit = params?.limit ?? 100;
  qs.set("limit", String(limit));

  if (params?.childId) qs.set("childId", params.childId);

  const data = await apiGet<unknown>(`/api/calendar?${qs.toString()}`);
  return unwrapList<CalendarEntry>(data);
}

export async function createCalendarEntry(input: {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
}): Promise<CalendarEntry> {
  return apiPost<CalendarEntry>("/api/calendar", input);
}

export async function deleteCalendarEntry(id: string): Promise<void> {
  await apiDelete<void>(`/api/calendar/${id}`);
}
