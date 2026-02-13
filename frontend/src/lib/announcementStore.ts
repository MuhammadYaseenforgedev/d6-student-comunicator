// src/lib/announcementStore.ts
import type { Announcement, AnnouncementCreate, ChannelKey } from "./types";
import { mockAnnouncements } from "./mockData";

const KEY = "d6_announcements_v1";

function safeParse(json: string | null): Announcement[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Announcement[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getAnnouncements(): Announcement[] {
  return safeParse(localStorage.getItem(KEY));
}

export function saveAnnouncements(items: Announcement[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function ensureDemoSeeded() {
  const current = getAnnouncements();
  if (current.length === 0) saveAnnouncements(mockAnnouncements);
}

export function resetAnnouncementsDemo() {
  saveAnnouncements(mockAnnouncements);
}

function makeId() {
  return `a-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function addAnnouncement(payload: AnnouncementCreate): Announcement {
  const newItem: Announcement = {
    ...payload,
    id: makeId(),
    createdAt: new Date().toISOString(),
  };
  const all = getAnnouncements();
  const next = [newItem, ...all];
  saveAnnouncements(next);
  return newItem;
}

export function getAnnouncementsByChannel(channel: ChannelKey): Announcement[] {
  return getAnnouncements().filter((a) => a.channel === channel);
}
