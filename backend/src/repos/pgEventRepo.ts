import { pool } from "../config/db";
import type { EventRepo, CreateEventInput, UpdateEventInput } from "../persistence/types";
import type { Event } from "../models/event";

type EventRow = {
  id: string;
  channel_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  created_by: string;
  created_at: string;
};

function mapRow(r: EventRow): Event {
  return {
    id: r.id,
    channelId: r.channel_id,
    title: r.title,
    description: r.description ?? "",
    location: r.location ?? "",
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
  } as unknown as Event;
}

export const pgEventRepo: EventRepo = {
  async listByChannel(channelId: string): Promise<Event[]> {
    const result = await pool.query<EventRow>(
      `
      SELECT *
      FROM events
      WHERE channel_id = $1
      ORDER BY starts_at ASC
      `,
      [channelId]
    );
    return result.rows.map(mapRow);
  },

  async create(input: CreateEventInput): Promise<Event> {
    const result = await pool.query<EventRow>(
      `
      INSERT INTO events (channel_id, title, description, location, starts_at, ends_at, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        input.channelId,
        input.title,
        input.description ?? null,
        input.location ?? null,
        input.startsAt,
        input.endsAt,
        input.createdBy,
      ]
    );
    return mapRow(result.rows[0]);
  },

  async update(input: UpdateEventInput): Promise<Event | null> {
    const result = await pool.query<EventRow>(
      `
      UPDATE events
      SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        location = COALESCE($4, location),
        starts_at = COALESCE($5, starts_at),
        ends_at = COALESCE($6, ends_at)
      WHERE id = $1
      RETURNING *
      `,
      [
        input.eventId,
        input.title ?? null,
        input.description ?? null,
        input.location ?? null,
        input.startsAt ?? null,
        input.endsAt ?? null,
      ]
    );

    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  },

  async delete(eventId: string): Promise<boolean> {
    const result = await pool.query(`DELETE FROM events WHERE id = $1`, [eventId]);
    return (result.rowCount ?? 0) > 0;
  },
};
