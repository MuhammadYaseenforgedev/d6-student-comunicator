import { randomUUID } from "crypto";
import type { Announcement } from "../models/announcement";
import { announcements } from "../store/announcementStore";
import type { UpdateAnnouncementInput } from "../persistence/types";

export const announcementRepo = {
  listByChannel(channelId: string) {
    // Return a new array so we don't mutate the store when sorting
    return announcements
      .filter((a) => a.channelId === channelId)
      .slice()
      .sort((a, b) => {
        // 1) pinned first
        const pinnedA = a.pinned ? 1 : 0;
        const pinnedB = b.pinned ? 1 : 0;
        if (pinnedA !== pinnedB) return pinnedB - pinnedA;

        // 2) newest first
        return b.createdAt.localeCompare(a.createdAt);
      });
  },

  create(input: {
    channelId: string;
    title: string;
    body: string;
    pinned?: boolean;
    createdBy: string;
  }): Announcement {
    const created: Announcement = {
      id: randomUUID(),
      channelId: input.channelId,
      title: input.title,
      body: input.body,
      pinned: Boolean(input.pinned),
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };

    announcements.push(created);
    return created;
  },

  update(input: UpdateAnnouncementInput): Announcement | null {
    const idx = announcements.findIndex(
      (a) => a.id === input.id && a.channelId === input.channelId
    );
    if (idx < 0) return null;

    const current = announcements[idx];
    announcements[idx] = {
      ...current,
      title: input.title ?? current.title,
      body: input.body ?? current.body,
      pinned: typeof input.pinned === "boolean" ? input.pinned : current.pinned,
    };
    return announcements[idx];
  },

  delete(id: string, channelId: string): boolean {
    const idx = announcements.findIndex((a) => a.id === id && a.channelId === channelId);
    if (idx < 0) return false;
    announcements.splice(idx, 1);
    return true;
  },
};
