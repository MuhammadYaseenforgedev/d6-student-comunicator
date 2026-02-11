import type { Repos } from "./types";

import { pgChannelRepo } from "../repos/pgChannelRepo";
import { pgAnnouncementRepo } from "../repos/pgAnnouncementRepo";
import { pgMessageRepo } from "../repos/pgMessageRepo";
import { pgEventRepo } from "../repos/pgEventRepo";

export const pgRepos: Repos = {
  channels: pgChannelRepo,
  announcements: pgAnnouncementRepo,
  messages: pgMessageRepo,
  events: pgEventRepo,
};
