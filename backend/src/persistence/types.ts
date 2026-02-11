import type { Channel, ChannelType } from "../models/channel";
import type { Announcement } from "../models/announcement";
import type { Message } from "../models/message";
import type { Event } from "../models/event";

/* =========
   Inputs
   ========= */

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

export type UpdateEventInput = {
  eventId: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  startsAt?: string;
  endsAt?: string;
};

/* =========
   Repos (ASYNC)
   ========= */

export type ChannelRepo = {
  list(): Promise<Channel[]>;
  create(input: CreateChannelInput): Promise<Channel>;
  join(channelId: string, userId: string): Promise<Channel | null>;
};

export type AnnouncementRepo = {
  listByChannel(channelId: string): Promise<Announcement[]>;
  create(input: CreateAnnouncementInput): Promise<Announcement>;
};

export type MessageRepo = {
  listByChannel(channelId: string): Promise<Message[]>;
  create(input: CreateMessageInput): Promise<Message>;
  delete(messageId: string): Promise<boolean>;
};

export type EventRepo = {
  listByChannel(channelId: string): Promise<Event[]>;
  create(input: CreateEventInput): Promise<Event>;
  update(input: {
    eventId: string;
    title?: string;
    description?: string | null;
    location?: string | null;
    startsAt?: string;
    endsAt?: string;
  }): Promise<Event | null>;
  delete(eventId: string): Promise<boolean>;
};

/* =========
   Repos Container
   ========= */

export type Repos = {
  channels: ChannelRepo;
  announcements: AnnouncementRepo;
  messages: MessageRepo;
  events: EventRepo;
};
