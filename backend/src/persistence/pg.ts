import type { Repos } from "./types";

import { pgChannelRepo } from "../repos/pgChannelRepo";
import { pgAnnouncementRepo } from "../repos/pgAnnouncementRepo";
import { pgMessageRepo } from "../repos/pgMessageRepo";
import { pgEventRepo } from "../repos/pgEventRepo";
import { pgUploadRepo } from "../repos/pgUploadRepo";
import { pgParentLinksRepo } from "../repos/pgParentLinksRepo";
import { pgThreadRepo } from "../repos/pgThreadRepo";
import { pgCalendarRepo } from "../repos/pgCalendarRepo";
import { pgFinanceRepo } from "../repos/pgFinanceRepo";

export const pgRepos = {
  channels: pgChannelRepo,
  announcements: pgAnnouncementRepo,
  messages: pgMessageRepo,
  events: pgEventRepo,
  uploads: pgUploadRepo,
  parentLinks: pgParentLinksRepo,
  threads: pgThreadRepo,
  calendar: pgCalendarRepo,
  finance: pgFinanceRepo,
} satisfies Repos;
