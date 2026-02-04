import type { Channel } from "../models/channel";
import type { Announcement } from "../models/announcement";
import type { Message } from "../models/message";
import type { Event } from "../models/event";
import type { ChannelType } from "../models/channel";

export type CreateChannelInput = {
  name: string;
  type: ChannelType;
  isPrivate?: boolean;
  createdBy: string;
};

export type CreateAnnouncementInput = {
  channelId: string;
  title: string;
  body: string;
  pinned?: boolean;
  createdBy: string;
};

export type CreateMessageInput = {
  channelId: string;
  body: string;
  createdBy: string;
};

export type CreateEventInput = {
  channelId: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  createdBy: string;
};

export type ChannelRepo = {
  list(): Channel[];
  create(input: CreateChannelInput): Channel;
  join(channelId: string, userId: string): Channel | null;
};

export type AnnouncementRepo = {
  listByChannel(channelId: string): Announcement[];
  create(input: CreateAnnouncementInput): Announcement;
};

export type MessageRepo = {
  listByChannel(channelId: string): Message[];
  create(input: CreateMessageInput): Message;
  delete(messageId: string): boolean;
};

export type EventRepo = {
  listByChannel(channelId: string): Event[];
  create(input: CreateEventInput): Event;
  delete(eventId: string): boolean;
};

export type Repos = {
  channels: ChannelRepo;
  announcements: AnnouncementRepo;
  messages: MessageRepo;
  events: EventRepo;
};
