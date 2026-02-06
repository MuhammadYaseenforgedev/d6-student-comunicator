import type { Repos } from "./types";
import { pgChannelRepo } from "../repos/pgChannelRepo";
import { announcementRepo } from "../repos/announcementRepo";
import { messageRepo } from "../repos/messageRepo";
import { eventRepo } from "../repos/eventRepo";

export const memoryRepos: Repos = {
  // ✅ Channels now come from Postgres
  channels: pgChannelRepo,

  // ✅ Keep the rest on memory for now (wrapped to match async types)
  announcements: {
    listByChannel: async (channelId) => announcementRepo.listByChannel(channelId),
    create: async (input) => announcementRepo.create(input),
  },

  messages: {
    listByChannel: async (channelId) => messageRepo.listByChannel(channelId),
    create: async (input) => messageRepo.create(input),
    delete: async (messageId) => messageRepo.delete(messageId),
  },

  events: {
    listByChannel: async (channelId) => eventRepo.listByChannel(channelId),
    create: async (input) => eventRepo.create(input),
    delete: async (eventId) => eventRepo.delete(eventId),
  },
};
