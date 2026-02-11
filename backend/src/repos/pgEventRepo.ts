import { pool } from "../config/db";
import type { Repos } from "../persistence/types";
import type { Event } from "../models/event";

type CreateEventInput = {
  channelId: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  createdBy: string;
};

export const pgEventRepo: Repos["events"] = {
  async create(input: CreateEventInput): Promise<Event> {
    const { channelId, title, description, location, startsAt, endsAt, createdBy } = input;

    const result = await pool.query(
      `
      INSERT INTO events (channel_id, title, description, location, starts_at, ends_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        channel_id AS "channelId",
        title,
        description,
        location,
        starts_at AS "startsAt",
        ends_at AS "endsAt",
        created_by AS "createdBy",
        created_at AS "createdAt"
      `,
      [channelId, title, description ?? null, location ?? null, startsAt, endsAt, createdBy]
    );

    return result.rows[0];
  },

  async listByChannel(channelId: string): Promise<Event[]> {
    const result = await pool.query(
      `
      SELECT
        id,
        channel_id AS "channelId",
        title,
        description,
        location,
        starts_at AS "startsAt",
        ends_at AS "endsAt",
        created_by AS "createdBy",
        created_at AS "createdAt"
      FROM events
      WHERE channel_id = $1
      ORDER BY starts_at ASC
      `,
      [channelId]
    );

    return result.rows;
  },

  async update(input): Promise<Event | null> {
    const { eventId, title, description, location, startsAt, endsAt } = input;

    const result = await pool.query(
      `
      UPDATE events SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        location = COALESCE($4, location),
        starts_at = COALESCE($5, starts_at),
        ends_at = COALESCE($6, ends_at)
      WHERE id = $1
      RETURNING
        id,
        channel_id AS "channelId",
        title,
        description,
        location,
        starts_at AS "startsAt",
        ends_at AS "endsAt",
        created_by AS "createdBy",
        created_at AS "createdAt"
      `,
      [eventId, title, description, location, startsAt, endsAt]
    );

    return result.rows[0] ?? null;
  },

  async delete(eventId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM events WHERE id = $1`,
      [eventId]
    );

    return (result.rowCount ?? 0) > 0;
  },
};
