import { pool } from "../config/db";
import type {
  AnnouncementRepo,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "../persistence/types";
import type { Announcement } from "../models/announcement";

export const pgAnnouncementRepo: AnnouncementRepo = {
  async create(input: CreateAnnouncementInput): Promise<Announcement> {
    const { channelId, moduleId, title, body, createdBy, pinned } = input;

    const result = await pool.query(
      `
      insert into announcements (channel_id, module_id, title, body, pinned, created_by)
      values ($1, $2, $3, $4, $5, $6)
      returning
        id,
        channel_id as "channelId",
        module_id as "moduleId",
        NULL::text as "moduleCode",
        NULL::text as "moduleName",
        title,
        body,
        pinned,
        created_by as "createdBy",
        created_at as "createdAt"
      `,
      [channelId, moduleId ?? null, title, body, Boolean(pinned), createdBy]
    );

    return result.rows[0];
  },

  async listByChannel(channelId: string): Promise<Announcement[]> {
    const result = await pool.query(
      `
      select
        a.id,
        a.channel_id as "channelId",
        a.module_id as "moduleId",
        fm.code as "moduleCode",
        fm.name as "moduleName",
        a.title,
        a.body,
        a.pinned,
        a.created_by as "createdBy",
        a.created_at as "createdAt"
      from announcements a
      left join faculty_modules fm on fm.id = a.module_id
      where a.channel_id = $1
      order by a.pinned desc, a.created_at desc
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
        module_id as "moduleId",
        NULL::text as "moduleCode",
        NULL::text as "moduleName",
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
