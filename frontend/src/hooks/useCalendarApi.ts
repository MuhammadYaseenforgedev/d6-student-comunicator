import { useCallback, useEffect, useMemo, useState } from "react";
import { getUser } from "../lib/auth";
import {
  createCalendarEntry,
  deleteCalendarEntry,
  listCalendar,
  type CalendarEntry,
} from "../api/calendar";

// ✅ Re-export so other files can import it from the hook without TS2459
export type { CalendarEntry };

function toLocalInputValue(iso: string) {
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

function todayDateParam() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isDateOnly(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * If childId is provided (Parent Portal Calendar), we fetch that child's entries.
 * If role is PARENT and childId is missing, we DO NOT call the backend (prevents 400).
 */
export function useCalendarApi(date?: string, childId?: string) {
  const user = getUser();
  const role = (user?.role ?? "STUDENT").toUpperCase();

  // Backward compatibility: existing callers may still pass only childId as the first argument.
  const resolvedDate = date && isDateOnly(date) ? date : undefined;
  const resolvedChildId = childId ?? (date && !isDateOnly(date) ? date : undefined);

  const canCreate = role === "ADMIN" || role === "LECTURER" || role === "STUDENT";
  const canDelete = role !== "PARENT"; // parent cannot delete

  const [items, setItems] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Parent must select a child first, otherwise backend returns 400.
      if (role === "PARENT" && !resolvedChildId) {
        setItems([]);
        return;
      }

      const list = await listCalendar({
        date: resolvedDate ?? todayDateParam(),
        limit: 100,
        childId: role === "PARENT" ? resolvedChildId : undefined,
      });

      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [resolvedChildId, resolvedDate, role]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const it of items) {
      const ts = Date.parse(it.startsAt);
      if (!Number.isFinite(ts)) continue; // skip malformed rows without crashing
      const day = new Date(ts).toISOString().slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(it);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const create = useCallback(
    async (payload: {
      title: string;
      description?: string;
      location?: string;
      startsLocal: string;
      endsLocal: string;
    }) => {
      setError(null);

      if (!canCreate) {
        setError("Your role cannot create calendar entries.");
        return;
      }

      const title = payload.title.trim();
      if (!title) {
        setError("Title is required");
        return;
      }

      const startsAt = fromLocalInputValue(payload.startsLocal);
      const endsAt = fromLocalInputValue(payload.endsLocal);

      if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
        setError("End time must be after start time");
        return;
      }

      try {
        await createCalendarEntry({
          title,
          description: payload.description?.trim() || null,
          location: payload.location?.trim() || null,
          startsAt,
          endsAt,
        });
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create entry");
      }
    },
    [canCreate, reload]
  );

  const remove = useCallback(
    async (id: string) => {
      setError(null);

      if (!canDelete) {
        setError("Your role cannot delete calendar entries.");
        return;
      }

      try {
        await deleteCalendarEntry(id);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete entry");
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
    create,
    remove,
    toLocalInputValue,
  };
}
