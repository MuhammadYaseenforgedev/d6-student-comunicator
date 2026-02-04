import type { Announcement } from "./types";

const STORAGE_KEY = "d6_announcements_v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readAll(): Announcement[] {
  const data = safeParse<Announcement[]>(localStorage.getItem(STORAGE_KEY), []);
  return Array.isArray(data) ? data : [];
}

function writeAll(items: Announcement[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getAnnouncements(): Announcement[] {
  return readAll();
}

export function addAnnouncement(
  payload: Omit<Announcement, "id" | "createdAt">
): Announcement {
  const next: Announcement = {
    id: makeId(),
    createdAt: new Date().toISOString(),
    ...payload,
  };

  const all = readAll();
  writeAll([next, ...all]);
  return next;
}

export function resetAnnouncementsDemo() {
  const demo: Announcement[] = [
    {
      id: makeId(),
      channel: "emergency",
      title: "Power outage notice",
      body: "There may be a short power outage today between 14:00–16:00.",
      pinned: true,
      author: "Security",
      createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    },
    {
      id: makeId(),
      channel: "faculty",
      title: "Timetable updates",
      body: "Please check the updated timetable. Some classes changed venues.",
      pinned: true,
      author: "Admin",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    },
    {
      id: makeId(),
      channel: "modules",
      title: "ADI632: Test 1 moved to Friday",
      body: "Test 1 has been moved to Friday 10:00. Venue will be confirmed.",
      pinned: false,
      author: "Lecturer",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    },
    {
      id: makeId(),
      channel: "clubs",
      title: "Chess Club tryouts",
      body: "Tryouts this Wednesday at 15:30 in Lab 2. Everyone welcome.",
      pinned: false,
      author: "Club Lead",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    },
  ];

  writeAll(demo);
}
