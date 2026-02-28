// src/hooks/useCalendar.ts
import { useCallback, useEffect, useState } from "react";
import type { CalendarEvent, StudentCalendarNote } from "../lib/types";
import {
  addCalendarEvent,
  addStudentNote,
  deleteStudentNote,
  ensureCalendarSeeded,
  listCalendarEvents,
  listStudentNotes,
} from "../lib/calendarStore";
import { getUser } from "../lib/auth";

export function useCalendar() {
  const user = getUser();
  const role = user?.role ?? "STUDENT";
  const email = (user?.email ?? "dev@local").trim().toLowerCase();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [notes, setNotes] = useState<StudentCalendarNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ useCallback makes "load" stable, so eslint is happy
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      ensureCalendarSeeded();
      setEvents(listCalendarEvents());
      setNotes(listStudentNotes(email));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [email]);

  // Campus event creation (MVP: allow admin/lecturer)
  const createEvent = useCallback(
    async (payload: {
      title: string;
      description?: string;
      date: string;
      category?: CalendarEvent["category"];
    }) => {
      setError(null);
      try {
        addCalendarEvent({
          ...payload,
          createdBy: email,
          createdByRole: role,
        });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create event");
      }
    },
    [email, role, load]
  );

  // Student note creation
  const createNote = useCallback(
    async (payload: { date: string; eventId?: string; body: string }) => {
      setError(null);
      try {
        addStudentNote({ ownerEmail: email, ...payload });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save note");
      }
    },
    [email, load]
  );

  const removeNote = useCallback(
    async (noteId: string) => {
      setError(null);
      try {
        deleteStudentNote(noteId, email);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete note");
      }
    },
    [email, load]
  );

  useEffect(() => {
    load();
  }, [load]);

  const canCampusUpload = role === "ADMIN" || role === "LECTURER";
  const canStudentNotes = role === "STUDENT";

  return {
    events,
    notes,
    loading,
    error,
    reload: load,
    createEvent,
    createNote,
    removeNote,
    role,
    email,
    canCampusUpload,
    canStudentNotes,
  };
}
