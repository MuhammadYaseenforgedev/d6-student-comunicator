import { pool } from "../config/db";
import type {
  AnnouncementRepo,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "../persistence/types";
import type { Announcement } from "../models/announcement";

export const pgAnnouncementRepo: AnnouncementRepo = {
  async create(input: CreateAnnouncementInput): Promise<Announcement> {
    const { channelId, title, body, createdBy, pinned } = input;

    const result = await pool.query(
      `
      insert into announcements (channel_id, title, body, pinned, created_by)
      values ($1, $2, $3, $4, $5)
      returning
        id,
        channel_id as "channelId",
        title,
        body,
        pinned,
        created_by as "createdBy",
        created_at as "createdAt"
      `,
      [channelId, title, body, Boolean(pinned), createdBy]
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
        pinned,
        created_by as "createdBy",
        created_at as "createdAt"
      from announcements
      where channel_id = $1
      order by pinned desc, created_at desc
      `,
      [channelId]
    );

    return result.rows;
  },

  async update(input: UpdateAnnouncementInput): Promise<Announcement | null> {
    const title = input.title ?? null;
    const body = input.body ?? null;
    const pinned = typeof input.pinned === "boolean" ? input.pinned : null;

    const result = await pool.query<Announcement>(
      `
      UPDATE announcements
      SET
        title = COALESCE($3, title),
        body = COALESCE($4, body),
        pinned = COALESCE($5, pinned)
      WHERE id = $1
        AND channel_id = $2
      RETURNING
        id,
        channel_id as "channelId",
        title,
        body,
        pinned,
        created_by as "createdBy",
        created_at as "createdAt"
      `,
      [input.id, input.channelId, title, body, pinned]
    );

    if ((result.rowCount ?? 0) === 0) return null;
    return result.rows[0];
  },

  async delete(id: string, channelId: string): Promise<boolean> {
    const result = await pool.query(
      `
      DELETE FROM announcements
      WHERE id = $1
        AND channel_id = $2
      `,
      [id, channelId]
    );
    return (result.rowCount ?? 0) > 0;
  },
};
