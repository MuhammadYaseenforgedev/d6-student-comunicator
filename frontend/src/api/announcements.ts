import type { Announcement, AnnouncementCreate, ChannelKey } from "../lib/types";
import { api } from "./client";

export async function fetchAnnouncements(channel?: ChannelKey) {
  const qs = channel ? `?channel=${encodeURIComponent(channel)}` : "";
  return api<Announcement[]>(`/announcements${qs}`);
}

export async function createAnnouncement(payload: AnnouncementCreate) {
  return api<Announcement>(`/announcements`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
