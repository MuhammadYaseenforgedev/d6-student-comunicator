import { pool } from "../config/db";
import type {
  AnnouncementRepo,
  CreateAnnouncementInput,
} from "../persistence/types";
import type { Announcement } from "../models/announcement";

export const pgAnnouncementRepo: AnnouncementRepo = {
  async create(input: CreateAnnouncementInput): Promise<Announcement> {
    const { channelId, title, body, createdBy } = input;

    const result = await pool.query(
      `
      insert into announcements (channel_id, title, body, created_by)
      values ($1, $2, $3, $4)
      returning
        id,
        channel_id as "channelId",
        title,
        body,
        created_by as "createdBy",
        created_at as "createdAt"
      `,
      [channelId, title, body, createdBy]
    );

    return result.rows[0];
  },

  async listByChannel(channelId: string): Promise<Announcement[]> {
    const result = await pool.query(
      `
      select
        id,
        channel_id as "channelId",
        title,
        body,
        created_by as "createdBy",
        created_at as "createdAt"
      from announcements
      where channel_id = $1
      order by created_at desc
      `,
      [channelId]
    );

    return result.rows;
  },
};
