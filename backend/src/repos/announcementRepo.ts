import { randomUUID } from "crypto";
import type { Announcement } from "../models/announcement";
import { announcements } from "../store/announcementStore";
import type { UpdateAnnouncementInput } from "../persistence/types";

const DEFAULT_ANNOUNCEMENT_DURATION_DAYS = 30;

export const announcementRepo = {
  listByChannel(channelId: string, opts?: { includeExpired?: boolean }) {
    const now = Date.now();
    // Return a new array so we don't mutate the store when sorting
    return announcements
      .filter((a) => {
        if (a.channelId !== channelId) return false;
        if (opts?.includeExpired) return true;
        if (!a.expiresAt) return true;
        const expiresAt = new Date(a.expiresAt).getTime();
        return !Number.isFinite(expiresAt) || expiresAt > now;
      })
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
    expiresAt?: string;
  }): Announcement {
    const created: Announcement = {
      id: randomUUID(),
      channelId: input.channelId,
      title: input.title,
      body: input.body,
      pinned: Boolean(input.pinned),
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      expiresAt:
        input.expiresAt ??
        new Date(
          Date.now() + DEFAULT_ANNOUNCEMENT_DURATION_DAYS * 24 * 60 * 60 * 1000
        ).toISOString(),
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
      expiresAt: input.expiresAt ?? current.expiresAt ?? null,
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
