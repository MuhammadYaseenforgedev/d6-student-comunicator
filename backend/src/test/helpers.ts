import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { pool } from "../config/db";

export type Role = "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";

function newId() {
  // Node 18+ supports crypto.randomUUID()
  return crypto.randomUUID();
}

export async function createUser(role: Role, email?: string, password = "Passw0rd!") {
  const safeEmail =
    email ?? `test_${role.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 10000)}@co.za`;

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await pool.query<{ id: string; email: string; role: Role }>(
    `
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id, email, role
    `,
    [safeEmail, passwordHash, role]
  );

  return { ...result.rows[0], password };
}

export function signJwt(user: { id: string; email: string; role: Role }) {
  const secret = process.env.JWT_SECRET ?? "dev_secret_change_me";
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, { expiresIn: "7d" });
}

export async function createChannel(createdByUserId: string, name?: string) {
  const channelName = name ?? `test-channel-${Date.now()}`;
  const id = newId();

  const res = await pool.query<{ id: string }>(
    `
      INSERT INTO channels (id, name, type, is_private, created_by)
      VALUES ($1, $2, 'GENERAL', false, $3)
      RETURNING id
    `,
    [id, channelName, createdByUserId]
  );

  return res.rows[0].id;
}

export async function createAnnouncement(channelId: string, authorId: string, title?: string) {
  const id = newId();
  const t = title ?? `Test Announcement ${Date.now()}`;

  const r = await pool.query<{ id: string }>(
    `
      INSERT INTO announcements (id, channel_id, title, body, created_by)
      VALUES ($1, $2, $3, 'test body', $4)
      RETURNING id
    `,
    [id, channelId, t, authorId]
  );

  return r.rows[0].id;
}

/**
 * Create an event without assuming your schema.
 * Supports:
 * - starts_at + ends_at (NOT NULL ends_at)  ✅ your current case
 * - event_date
 * - fallback detection error with column list
 */
export async function createEvent(channelId: string, authorId: string, title?: string) {
  const id = newId();
  const t = title ?? `Test Event ${Date.now()}`;

  const colsRes = await pool.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'events'
    `
  );

  const cols = new Set(colsRes.rows.map((r) => r.column_name));

  // Your backend routes use startsAt/endsAt, so your DB likely has starts_at/ends_at.
  const hasStartsAt = cols.has("starts_at");
  const hasEndsAt = cols.has("ends_at");

  // Case 1: starts_at + ends_at
  if (hasStartsAt && hasEndsAt) {
    const sql = `
      INSERT INTO events (id, channel_id, title, description, starts_at, ends_at, created_by)
      VALUES ($1, $2, $3, 'test desc', now() + interval '1 day', now() + interval '1 day' + interval '1 hour', $4)
      RETURNING id
    `;
    const r = await pool.query<{ id: string }>(sql, [id, channelId, t, authorId]);
    return r.rows[0].id;
  }

  // Case 2: legacy single datetime column like event_date
  const dateCol =
    cols.has("event_date") ? "event_date" :
    cols.has("event_at") ? "event_at" :
    cols.has("date") ? "date" :
    cols.has("starts_on") ? "starts_on" :
    null;

  if (dateCol) {
    const sql = `
      INSERT INTO events (id, channel_id, title, description, ${dateCol}, created_by)
      VALUES ($1, $2, $3, 'test desc', now() + interval '1 day', $4)
      RETURNING id
    `;
    const r = await pool.query<{ id: string }>(sql, [id, channelId, t, authorId]);
    return r.rows[0].id;
  }

  throw new Error(
    `Could not determine event datetime columns. Columns found: ${Array.from(cols).join(", ")}`
  );
}

export async function cleanupTestUsers() {
  // IMPORTANT:
  // Some tables store created_by / user_id as TEXT while users.id is UUID (or vice versa).
  // Cast to text to avoid "operator does not exist: text = uuid".

  await pool.query(
    `
      DELETE FROM messages m
      USING users u
      WHERE m.created_by::text = u.id::text
        AND u.email LIKE 'test_%@co.za'
    `
  );

  await pool.query(
    `
      DELETE FROM announcements a
      USING users u
      WHERE a.created_by::text = u.id::text
        AND u.email LIKE 'test_%@co.za'
    `
  );

  await pool.query(
    `
      DELETE FROM events e
      USING users u
      WHERE e.created_by::text = u.id::text
        AND u.email LIKE 'test_%@co.za'
    `
  );

  await pool.query(
    `
      DELETE FROM uploads up
      USING users u
      WHERE up.uploaded_by::text = u.id::text
        AND u.email LIKE 'test_%@co.za'
    `
  );

  await pool.query(
    `
      DELETE FROM channel_members cm
      USING users u
      WHERE cm.user_id::text = u.id::text
        AND u.email LIKE 'test_%@co.za'
    `
  );

  await pool.query(
    `
      DELETE FROM channels c
      USING users u
      WHERE c.created_by::text = u.id::text
        AND u.email LIKE 'test_%@co.za'
    `
  );

  await pool.query(`DELETE FROM users WHERE email LIKE 'test_%@co.za'`);
}
