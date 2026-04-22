import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";

export type CalendarEntrySource = "CALENDAR_ENTRY" | "COURSE_ENTRY" | "CHANNEL_EVENT" | null;

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
  courseId?: string | null;
  courseCode?: string | null;
  courseName?: string | null;
  canDelete?: boolean;
  source?: CalendarEntrySource;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (isRecord(data)) {
    const value = data.value;
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

/**
 * For PARENT role: pass childId to view that child's calendar.
 * For others: omit childId.
 */
export async function listCalendar(params?: {
  date?: string;
  start?: string;
  end?: string;
  limit?: number;
  childId?: string;
}): Promise<CalendarEntry[]> {
  const qs = new URLSearchParams();

  if (params?.date) qs.set("date", params.date);
  if (params?.start) qs.set("start", params.start);
  if (params?.end) qs.set("end", params.end);

  const limit = params?.limit ?? 250;
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
  courseId?: string | null;
}): Promise<CalendarEntry> {
  return apiPost<CalendarEntry>("/api/calendar", input);
}

export async function updateCalendarEntry(
  id: string,
  input: {
    title: string;
    description?: string | null;
    location?: string | null;
    startsAt: string;
    endsAt: string;
    courseId?: string | null;
  }
): Promise<CalendarEntry> {
  return apiPatch<CalendarEntry>(`/api/calendar/${id}`, input);
}

export async function deleteCalendarEntry(id: string): Promise<void> {
  await apiDelete<void>(`/api/calendar/${id}`);
}
