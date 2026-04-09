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
  channelId?: string | null;
  courseId?: string | null;
  courseCode?: string | null;
  courseName?: string | null;
  canDelete?: boolean;
  source?: "CALENDAR_ENTRY" | "COURSE_ENTRY" | "CHANNEL_EVENT";
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
  channel_id: string | null;
  course_id: string | null;
  course_code: string | null;
  course_name: string | null;
  can_delete: boolean;
  source: "CALENDAR_ENTRY" | "COURSE_ENTRY" | "CHANNEL_EVENT";
};

function parseLimit(raw: unknown, fallback = 50) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

export const pgCalendarRepo = {
  async listForUser(
    userId: string,
    opts?: { limit?: number; date?: string; role?: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT" }
  ): Promise<CalendarEntry[]> {
    const limit = parseLimit(opts?.limit, 50);
    const date = String(opts?.date ?? "").trim() || null;
    const role = String(opts?.role ?? "STUDENT").toUpperCase();

    const q = `
      WITH combined AS (
        SELECT
          ce.id,
          ce.user_id::text AS user_id,
          ce.title,
          ce.description,
          ce.location,
          ce.starts_at,
          ce.ends_at,
          ce.created_at,
          NULL::uuid AS channel_id,
          NULL::uuid AS course_id,
          NULL::text AS course_code,
          NULL::text AS course_name,
          ($1::text = ce.user_id::text) AS can_delete,
          'CALENDAR_ENTRY'::text AS source
        FROM calendar_entries ce
        WHERE ce.user_id::text = $1::text
          AND ce.course_id IS NULL
          AND (
            ($3::date IS NOT NULL AND ce.starts_at::date = $3::date)
            OR ($3::date IS NULL AND ce.ends_at >= now())
          )

        UNION ALL

        SELECT
          ce.id,
          ce.user_id::text AS user_id,
          ce.title,
          ce.description,
          ce.location,
          ce.starts_at,
          ce.ends_at,
          ce.created_at,
          NULL::uuid AS channel_id,
          ce.course_id,
          c.code AS course_code,
          c.name AS course_name,
          CASE
            WHEN $4::text = 'ADMIN' THEN true
            WHEN ce.user_id::text = $1::text THEN true
            ELSE false
          END AS can_delete,
          'COURSE_ENTRY'::text AS source
        FROM calendar_entries ce
        JOIN courses c ON c.id = ce.course_id
        WHERE ce.course_id IS NOT NULL
          AND (
            $4::text = 'ADMIN'
            OR (
              $4::text = 'LECTURER'
              AND EXISTS (
                SELECT 1
                FROM lecturer_module_assignments lma
                JOIN faculty_modules fm ON fm.id = lma.module_id
                WHERE lma.lecturer_id::text = $1::text
                  AND fm.course_id = ce.course_id
              )
            )
            OR (
              $4::text IN ('STUDENT', 'PARENT')
              AND EXISTS (
                SELECT 1
                FROM student_courses sc
                WHERE sc.student_user_id::text = $1::text
                  AND sc.course_id = ce.course_id
                  AND sc.status = 'ACTIVE'
              )
            )
          )
          AND (
            ($3::date IS NOT NULL AND ce.starts_at::date = $3::date)
            OR ($3::date IS NULL AND ce.ends_at >= now())
          )

        UNION ALL

        SELECT
          e.id,
          $1::text AS user_id,
          e.title,
          e.description,
          e.location,
          e.starts_at,
          e.ends_at,
          e.created_at,
          e.channel_id,
          NULL::uuid AS course_id,
          NULL::text AS course_code,
          NULL::text AS course_name,
          false AS can_delete,
          'CHANNEL_EVENT'::text AS source
        FROM events e
        JOIN channels c ON c.id = e.channel_id
        LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id::text = $1::text
        WHERE (
          $4::text IN ('ADMIN', 'LECTURER')
          OR ($4::text = 'PARENT' AND COALESCE(c.is_private, false) = false)
          OR ($4::text = 'STUDENT' AND (COALESCE(c.is_private, false) = false OR cm.user_id IS NOT NULL))
        )
          AND (
            ($3::date IS NOT NULL AND e.starts_at::date = $3::date)
            OR ($3::date IS NULL AND e.ends_at >= now())
          )
      )
      SELECT
        id,
        user_id,
        title,
        description,
        location,
        starts_at,
        ends_at,
        created_at,
        channel_id,
        course_id,
        course_code,
        course_name,
        can_delete,
        source
      FROM combined
      ORDER BY starts_at ASC
      LIMIT $2
    `;
    const res = await pool.query<Row>(q, [userId, limit, date, role]);

    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      description: r.description,
      location: r.location,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      createdAt: r.created_at,
      channelId: r.channel_id,
      courseId: r.course_id,
      courseCode: r.course_code,
      courseName: r.course_name,
      canDelete: Boolean(r.can_delete),
      source: r.source,
    }));
  },

  async createForUser(
    userId: string,
    input: {
      title: string;
      description?: string | null;
      location?: string | null;
      startsAt: string;
      endsAt: string;
      courseId?: string | null;
    }
  ): Promise<CalendarEntry> {
    const title = String(input.title ?? "").trim();
    if (!title) throw Object.assign(new Error("title is required"), { code: "VALIDATION" });

    const startsAt = String(input.startsAt ?? "").trim();
    const endsAt = String(input.endsAt ?? "").trim();
    if (!startsAt || !endsAt) {
      throw Object.assign(new Error("startsAt and endsAt are required"), { code: "VALIDATION" });
    }

    const q = `
      INSERT INTO calendar_entries (user_id, course_id, title, description, location, starts_at, ends_at)
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
      RETURNING id, user_id, title, description, location, starts_at, ends_at, created_at, course_id
    `;
    const res = await pool.query<Row>(q, [
      userId,
      input.courseId ?? null,
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
      courseId: r.course_id,
      canDelete: true,
      source: r.course_id ? "COURSE_ENTRY" : "CALENDAR_ENTRY",
    };
  },

  async deleteForUser(
    userId: string,
    entryId: string,
    role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT"
  ): Promise<boolean> {
    const id = String(entryId ?? "").trim();
    if (!id) throw Object.assign(new Error("id is required"), { code: "VALIDATION" });

    const q = `
      DELETE FROM calendar_entries
      WHERE id = $1
        AND (
          user_id = $2
          OR ($3 = 'ADMIN' AND course_id IS NOT NULL)
        )
    `;
    const res = await pool.query(q, [id, userId, role]);

    // rowCount can be null in pg typings, so guard it
    return (res.rowCount ?? 0) > 0;
  },
};
