import { pool } from "../config/db";

export type CalendarEntry = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

type Row = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
};

function parseLimit(raw: unknown, fallback = 50) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

export const pgCalendarRepo = {
  async listForUser(userId: string, opts?: { limit?: number }): Promise<CalendarEntry[]> {
    const limit = parseLimit(opts?.limit, 50);

    const q = `
      SELECT id, user_id, title, description, location, starts_at, ends_at, created_at
      FROM calendar_entries
      WHERE user_id = $1
      ORDER BY starts_at ASC
      LIMIT $2
    `;
    const res = await pool.query<Row>(q, [userId, limit]);

    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      description: r.description,
      location: r.location,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      createdAt: r.created_at,
    }));
  },

  async createForUser(
    userId: string,
    input: { title: string; description?: string | null; location?: string | null; startsAt: string; endsAt: string }
  ): Promise<CalendarEntry> {
    const title = String(input.title ?? "").trim();
    if (!title) throw Object.assign(new Error("title is required"), { code: "VALIDATION" });

    const startsAt = String(input.startsAt ?? "").trim();
    const endsAt = String(input.endsAt ?? "").trim();
    if (!startsAt || !endsAt) throw Object.assign(new Error("startsAt and endsAt are required"), { code: "VALIDATION" });

    const q = `
      INSERT INTO calendar_entries (user_id, title, description, location, starts_at, ends_at)
      VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
      RETURNING id, user_id, title, description, location, starts_at, ends_at, created_at
    `;
    const res = await pool.query<Row>(q, [
      userId,
      title,
      input.description ?? null,
      input.location ?? null,
      startsAt,
      endsAt,
    ]);

    const r = res.rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      title: r.title,
      description: r.description,
      location: r.location,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      createdAt: r.created_at,
    };
  },
};
