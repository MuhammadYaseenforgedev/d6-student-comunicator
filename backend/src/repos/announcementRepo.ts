import { randomUUID } from "crypto";
import { Announcement } from "../models/announcement";

type CreateAnnouncementInput = {
  channelId: string;
  title: string;
  body: string;
  pinned?: boolean;
  createdBy: string;
};

class InMemoryAnnouncementRepo {
  private announcements: Announcement[] = [];

  listByChannel(channelId: string): Announcement[] {
    return this.announcements.filter((a) => a.channelId === channelId);
  }

  create(input: CreateAnnouncementInput): Announcement {
    const now = new Date().toISOString();

    const announcement: Announcement = {
      id: randomUUID(),
      channelId: input.channelId,
      title: input.title,
      body: input.body,
      pinned: Boolean(input.pinned),
      createdBy: input.createdBy,
      createdAt: now,
    };

    this.announcements.push(announcement);
    return announcement;
  }
}

export const announcementRepo = new InMemoryAnnouncementRepo();
