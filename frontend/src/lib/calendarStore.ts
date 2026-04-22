// src/lib/calendarStore.ts
import type { CalendarEvent, StudentCalendarNote, UserRole } from "./types";

const EVENTS_KEY = "d6_calendar_events_v1";
const NOTES_KEY = "d6_calendar_notes_v1";

// Small helper: ISO date-only string from Date
function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function loadJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Seed demo calendar so the UI isn't empty
export function ensureCalendarSeeded() {
  const existing = loadJson<CalendarEvent[]>(EVENTS_KEY, []);
  if (existing.length > 0) return;

  const today = new Date();
  const in7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const in14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const seed: CalendarEvent[] = [
    {
      id: "ev-1",
      title: "Assessment due: Database Assignment 1",
      description: "Submit via Uploads. Late submissions may be penalized.",
      date: isoDateOnly(in7),
      category: "ASSESSMENT",
      createdAt: new Date().toISOString(),
      createdBy: "campus@forge.ac.za",
      createdByRole: "ADMIN",
    },
    {
      id: "ev-2",
      title: "Exam: Software Development Theory",
      description: "Bring student card. Venue: Hall A.",
      date: isoDateOnly(in14),
      category: "EXAM",
      createdAt: new Date().toISOString(),
      createdBy: "campus@forge.ac.za",
      createdByRole: "ADMIN",
    },
    {
      id: "ev-3",
      title: "Campus Notice: Orientation session",
      description: "New resources + Q&A session.",
      date: isoDateOnly(today),
      category: "GENERAL",
      createdAt: new Date().toISOString(),
      createdBy: "campus@forge.ac.za",
      createdByRole: "ADMIN",
    },
  ];

  saveJson(EVENTS_KEY, seed);
}

// List events, sorted by date ascending
export function listCalendarEvents(): CalendarEvent[] {
  const items = loadJson<CalendarEvent[]>(EVENTS_KEY, []);
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}

// Add a campus event (MVP: allow ADMIN or LECTURER to simulate “campus upload”)
export function addCalendarEvent(params: {
  title: string;
  description?: string;
  date: string; // "YYYY-MM-DD"
  category?: CalendarEvent["category"];
  createdBy: string;
  createdByRole: UserRole;
}): CalendarEvent {
  const items = loadJson<CalendarEvent[]>(EVENTS_KEY, []);

  const ev: CalendarEvent = {
    id: `ev-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: params.title.trim(),
    description: params.description?.trim() || "",
    date: params.date,
    category: params.category ?? "GENERAL",
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
    createdByRole: params.createdByRole,
  };

  saveJson(EVENTS_KEY, [...items, ev]);
  return ev;
}

// Notes: students can store personal notes against dates/events
export function listStudentNotes(ownerEmail: string): StudentCalendarNote[] {
  const all = loadJson<StudentCalendarNote[]>(NOTES_KEY, []);
  return all
    .filter((n) => n.ownerEmail === ownerEmail)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addStudentNote(params: {
  ownerEmail: string;
  date: string;
  eventId?: string;
  body: string;
}): StudentCalendarNote {
  const all = loadJson<StudentCalendarNote[]>(NOTES_KEY, []);

  const note: StudentCalendarNote = {
    id: `note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ownerEmail: params.ownerEmail,
    date: params.date,
    eventId: params.eventId,
    body: params.body.trim(),
    createdAt: new Date().toISOString(),
  };

  saveJson(NOTES_KEY, [note, ...all]);
  return note;
}

export function deleteStudentNote(noteId: string, ownerEmail: string) {
  const all = loadJson<StudentCalendarNote[]>(NOTES_KEY, []);
  // Only delete if it belongs to the user
  saveJson(
    NOTES_KEY,
    all.filter((n) => !(n.id === noteId && n.ownerEmail === ownerEmail))
  );
}
