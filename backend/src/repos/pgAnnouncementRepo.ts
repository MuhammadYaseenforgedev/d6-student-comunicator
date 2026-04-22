import { pool } from "../config/db";
import type {
  AnnouncementRepo,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "../persistence/types";
import type { Announcement } from "../models/announcement";

export const pgAnnouncementRepo: AnnouncementRepo = {
  async create(input: CreateAnnouncementInput): Promise<Announcement> {
    const { channelId, moduleId, title, body, createdBy, pinned, expiresAt } = input;

    const result = await pool.query(
      `
      insert into announcements (channel_id, module_id, title, body, pinned, created_by, expires_at)
      values ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now() + interval '30 days'))
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
        created_at as "createdAt",
        expires_at as "expiresAt"
      `,
      [channelId, moduleId ?? null, title, body, Boolean(pinned), createdBy, expiresAt ?? null]
    );

    return result.rows[0];
  },

  async listByChannel(
    channelId: string,
    opts?: {
      includeExpired?: boolean;
    }
  ): Promise<Announcement[]> {
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
        a.created_at as "createdAt",
        a.expires_at as "expiresAt"
      from announcements a
      left join faculty_modules fm on fm.id = a.module_id
      where a.channel_id = $1
        and ($2::boolean = true or a.expires_at is null or a.expires_at > now())
      order by a.pinned desc, a.created_at desc
      `,
      [channelId, Boolean(opts?.includeExpired)]
    );

    return result.rows;
  },

  async update(input: UpdateAnnouncementInput): Promise<Announcement | null> {
    const title = input.title ?? null;
    const body = input.body ?? null;
    const pinned = typeof input.pinned === "boolean" ? input.pinned : null;
    const expiresAt = input.expiresAt ?? null;

    const result = await pool.query<Announcement>(
      `
      UPDATE announcements
      SET
        title = COALESCE($3, title),
        body = COALESCE($4, body),
        pinned = COALESCE($5, pinned),
        expires_at = COALESCE($6::timestamptz, expires_at)
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
        created_at as "createdAt",
        expires_at as "expiresAt"
      `,
      [input.id, input.channelId, title, body, pinned, expiresAt]
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
