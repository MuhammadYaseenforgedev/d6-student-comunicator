import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUser } from "../lib/auth";
import {
  createCalendarEntry,
  deleteCalendarEntry,
  listCalendar,
  updateCalendarEntry,
  type CalendarEntry,
} from "../api/calendar";

export type { CalendarEntry };

type CalendarQuery = {
  date?: string;
  start?: string;
  end?: string;
};

export function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function fromLocalInputValue(v: string) {
  const d = new Date(v);
  return d.toISOString();
}

function isDateOnly(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function normalizeQuery(query?: CalendarQuery): CalendarQuery {
  const date = String(query?.date ?? "").trim();
  const start = String(query?.start ?? "").trim();
  const end = String(query?.end ?? "").trim();

  if (start && end) return { start, end };
  if (date) return { date };
  return {};
}

function buildEntryPayload(payload: {
  title: string;
  description?: string;
  location?: string;
  startsLocal: string;
  endsLocal: string;
  courseId?: string;
}) {
  const title = payload.title.trim();
  if (!title) throw new Error("Title is required");

  const startsAt = fromLocalInputValue(payload.startsLocal);
  const endsAt = fromLocalInputValue(payload.endsLocal);

  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new Error("End time must be after start time");
  }

  return {
    title,
    description: payload.description?.trim() || null,
    location: payload.location?.trim() || null,
    startsAt,
    endsAt,
    courseId: payload.courseId?.trim() || null,
  };
}

/**
 * If childId is provided (Parent Portal Calendar), we fetch that child's entries.
 * If role is PARENT and childId is missing, we do not call the backend.
 * Existing callers may still pass childId as the first argument.
 */
export function useCalendarApi(date?: string, childId?: string) {
  const user = getUser();
  const role = (user?.role ?? "STUDENT").toUpperCase();

  const resolvedDate = date && isDateOnly(date) ? date : undefined;
  const resolvedChildId = childId ?? (date && !isDateOnly(date) ? date : undefined);

  const canCreate = role === "ADMIN" || role === "LECTURER" || role === "STUDENT";
  const canDelete = role !== "PARENT";

  const [items, setItems] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastQueryRef = useRef<CalendarQuery>(normalizeQuery({ date: resolvedDate }));

  const load = useCallback(
    async (query?: CalendarQuery) => {
      const nextQuery = normalizeQuery(query ?? lastQueryRef.current);
      lastQueryRef.current = nextQuery;

      setLoading(true);
      setError(null);

      try {
        if (role === "PARENT" && !resolvedChildId) {
          setItems([]);
          return;
        }

        const list = await listCalendar({
          ...nextQuery,
          limit: 250,
          childId: role === "PARENT" ? resolvedChildId : undefined,
        });

        setItems(Array.isArray(list) ? list : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load calendar");
      } finally {
        setLoading(false);
      }
    },
    [resolvedChildId, role]
  );

  useEffect(() => {
    void load(lastQueryRef.current);
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const it of items) {
      const ts = Date.parse(it.startsAt);
      if (!Number.isFinite(ts)) continue;
      const day = new Date(ts).toISOString().slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(it);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const reload = useCallback(async () => {
    await load(lastQueryRef.current);
  }, [load]);

  const loadDate = useCallback(
    async (nextDate: string) => {
      await load({ date: nextDate });
    },
    [load]
  );

  const loadRange = useCallback(
    async (start: string, end: string) => {
      await load({ start, end });
    },
    [load]
  );

  const create = useCallback(
    async (payload: {
      title: string;
      description?: string;
      location?: string;
      startsLocal: string;
      endsLocal: string;
      courseId?: string;
    }) => {
      setError(null);

      if (!canCreate) {
        setError("Your role cannot create calendar entries.");
        return false;
      }

      try {
        await createCalendarEntry(buildEntryPayload(payload));
        await reload();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create entry");
        return false;
      }
    },
    [canCreate, reload]
  );

  const update = useCallback(
    async (
      id: string,
      payload: {
        title: string;
        description?: string;
        location?: string;
        startsLocal: string;
        endsLocal: string;
        courseId?: string;
      }
    ) => {
      setError(null);

      if (!canDelete) {
        setError("Your role cannot update calendar entries.");
        return false;
      }

      try {
        await updateCalendarEntry(id, buildEntryPayload(payload));
        await reload();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update entry");
        return false;
      }
    },
    [canDelete, reload]
  );

  const remove = useCallback(
    async (id: string) => {
      setError(null);

      if (!canDelete) {
        setError("Your role cannot delete calendar entries.");
        return false;
      }

      try {
        await deleteCalendarEntry(id);
        await reload();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete entry");
        return false;
      }
    },
    [canDelete, reload]
  );

  return {
    role,
    canCreate,
    canDelete,
    loading,
    error,
    grouped,
    items,
    reload,
    refresh: reload,
    loadDate,
    loadRange,
    create,
    update,
    remove,
    toLocalInputValue,
  };
}
