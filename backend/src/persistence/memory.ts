import { channelRepo } from "../repos/channelRepo";
import { announcementRepo } from "../repos/announcementRepo";
import { messageRepo } from "../repos/messageRepo";
import { eventRepo } from "../repos/eventRepo";
import type { Repos } from "./types";

export const memoryRepos: Repos = {
  channels: channelRepo,
  announcements: announcementRepo,
  messages: messageRepo,
  events: eventRepo,
};
