import { pool } from "../config/db";

export type ThreadParticipant = { email: string };

export type Thread = {
  id: string;
  participants: ThreadParticipant[];
  lastMessageAt: string | null;
};

export type ThreadMessage = {
  id: string;
  threadId: string;
  body: string;
  createdBy: string;
  createdAt: string;
};

type ThreadRow = {
  id: string;
  last_message_at: string | null;
  created_at: string;
  activity_at: string;
};

type ParticipantRow = {
  thread_id: string;
  email: string;
};

type UserRow = {
  id: string;
  email: string;
  role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";
};

function parseLimit(raw: unknown, fallback = 50) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

function normalizeEmails(emails: unknown): string[] {
  if (!Array.isArray(emails)) return [];
  const cleaned = emails
    .map((e) => String(e ?? "").trim().toLowerCase())
    .filter((e) => e.length > 0);
  return Array.from(new Set(cleaned));
}

function threadsMode(): "ANY" | "PARENT_STUDENT" {
  const v = String(process.env.THREADS_MODE ?? "").trim().toUpperCase();
  return v === "PARENT_STUDENT" ? "PARENT_STUDENT" : "ANY";
}

async function getUsersByEmails(emails: string[]): Promise<UserRow[]> {
  const uq = `
    SELECT id, email, role
    FROM users
    WHERE lower(email) = ANY($1::text[])
  `;
  const ures = await pool.query<UserRow>(uq, [emails]);
  return ures.rows;
}

async function getUsersByIds(ids: string[]): Promise<UserRow[]> {
  const uq = `
    SELECT id, email, role
    FROM users
    WHERE id = ANY($1::uuid[])
  `;
  const ures = await pool.query<UserRow>(uq, [ids]);
  return ures.rows;
}

/**
 * Find an existing 1:1 thread between two users (exactly two participants).
 */
async function findExistingOneToOneThread(userA: string, userB: string): Promise<string | null> {
  const q = `
    SELECT tp.thread_id
    FROM thread_participants tp
    WHERE tp.user_id IN ($1, $2)
    GROUP BY tp.thread_id
    HAVING COUNT(DISTINCT tp.user_id) = 2
       AND (SELECT COUNT(*) FROM thread_participants tp2 WHERE tp2.thread_id = tp.thread_id) = 2
    LIMIT 1
  `;
  const res = await pool.query<{ thread_id: string }>(q, [userA, userB]);
  return res.rowCount ? res.rows[0].thread_id : null;
}

export const pgThreadRepo = {
  /**
   * List threads for a user with pagination.
   * - limit: max 100 (default 50)
   * - before: ISO timestamp cursor (older than this activity time)
   */
  async listForUser(userId: string, opts?: { limit?: number; before?: string }): Promise<{
    threads: Thread[];
    nextBefore: string | null;
  }> {
    const limit = parseLimit(opts?.limit, 50);
    const before = opts?.before ? String(opts.before) : null;

    const q = `
      WITH t0 AS (
        SELECT
          t.id,
          t.created_at,
          MAX(tm.created_at) AS last_message_at,
          COALESCE(MAX(tm.created_at), t.created_at) AS activity_at
        FROM threads t
        JOIN thread_participants tp ON tp.thread_id = t.id
        LEFT JOIN thread_messages tm ON tm.thread_id = t.id
        WHERE tp.user_id = $1
        GROUP BY t.id, t.created_at
      )
      SELECT id, created_at, last_message_at, activity_at
      FROM t0
      WHERE ($2::timestamptz IS NULL OR activity_at < $2::timestamptz)
      ORDER BY activity_at DESC
      LIMIT $3
    `;

    const res = await pool.query<ThreadRow>(q, [userId, before, limit]);
    const threadRows = res.rows;

    if (threadRows.length === 0) {
      return { threads: [], nextBefore: null };
    }

    const ids = threadRows.map((r) => r.id);

    const pq = `
      SELECT tp.thread_id, u.email
      FROM thread_participants tp
      JOIN users u ON u.id = tp.user_id
      WHERE tp.thread_id = ANY($1::uuid[])
      ORDER BY u.email ASC
    `;
    const pres = await pool.query<ParticipantRow>(pq, [ids]);

    const participantsByThread = new Map<string, ThreadParticipant[]>();
    for (const r of pres.rows) {
      const arr = participantsByThread.get(r.thread_id) ?? [];
      arr.push({ email: r.email });
      participantsByThread.set(r.thread_id, arr);
    }

    const threads: Thread[] = threadRows.map((t) => ({
      id: t.id,
      lastMessageAt: t.last_message_at,
      participants: participantsByThread.get(t.id) ?? [],
    }));

    const last = threadRows[threadRows.length - 1];
    return { threads, nextBefore: last.activity_at ?? null };
  },

  /**
   * Get one thread by id for the current user.
   * Only participants may access.
   */
  async getByIdForUser(threadId: string, userId: string): Promise<Thread> {
    const isP = await this.isParticipant(threadId, userId);
    if (!isP) {
      throw Object.assign(new Error("Not a participant"), { code: "FORBIDDEN" });
    }

    const tq = `
      SELECT
        t.id,
        MAX(tm.created_at) AS last_message_at
      FROM threads t
      LEFT JOIN thread_messages tm ON tm.thread_id = t.id
      WHERE t.id = $1
      GROUP BY t.id
      LIMIT 1
    `;
    const tres = await pool.query<{ id: string; last_message_at: string | null }>(tq, [threadId]);

    if (tres.rowCount === 0) {
      throw Object.assign(new Error("Thread not found"), { code: "NOT_FOUND" });
    }

    const pq = `
      SELECT tp.thread_id, u.email
      FROM thread_participants tp
      JOIN users u ON u.id = tp.user_id
      WHERE tp.thread_id = $1
      ORDER BY u.email ASC
    `;
    const pres = await pool.query<ParticipantRow>(pq, [threadId]);

    return {
      id: tres.rows[0].id,
      lastMessageAt: tres.rows[0].last_message_at,
      participants: pres.rows.map((r) => ({ email: r.email })),
    };
  },

  /**
   * Create thread with validation + duplicate 1:1 prevention.
   * Returns { created, thread } where created=false if we reused an existing 1:1.
   */
  async createThread(
    createdBy: string,
    participantEmails: unknown
  ): Promise<{ created: boolean; thread: Thread }> {
    const uniqueEmails = normalizeEmails(participantEmails);

    if (uniqueEmails.length === 0) {
      throw Object.assign(new Error("participantEmails is required"), { code: "VALIDATION" });
    }

    // Load users by email
    const users = await getUsersByEmails(uniqueEmails);
    if (users.length !== uniqueEmails.length) {
      throw Object.assign(new Error("One or more participant emails do not exist"), { code: "VALIDATION" });
    }

    const participantUserIds = users.map((u) => u.id);

    // Always include creator
    const allUserIds = Array.from(new Set([createdBy, ...participantUserIds]));

    // Prevent self-only thread
    if (allUserIds.length < 2) {
      throw Object.assign(new Error("Cannot create a thread with only yourself"), { code: "VALIDATION" });
    }

    // Optional role restriction
    if (threadsMode() === "PARENT_STUDENT") {
      const allUsers = await getUsersByIds(allUserIds);
      const roles = allUsers.map((u) => u.role);

      const isValidPair =
        allUserIds.length === 2 &&
        roles.includes("PARENT") &&
        roles.includes("STUDENT") &&
        !roles.includes("ADMIN") &&
        !roles.includes("LECTURER");

      if (!isValidPair) {
        throw Object.assign(
          new Error("Threads are restricted to 1:1 PARENT ↔ STUDENT in current configuration"),
          { code: "FORBIDDEN" }
        );
      }
    }

    // Prevent duplicate 1:1 thread
    if (allUserIds.length === 2) {
      const existingId = await findExistingOneToOneThread(allUserIds[0], allUserIds[1]);
      if (existingId) {
        // Build participants from the two users (creator might not be in emails list)
        const allUsers = await getUsersByIds(allUserIds);
        const participants = allUsers
          .map((u) => ({ email: u.email }))
          .sort((a, b) => a.email.localeCompare(b.email));

        // Get lastMessageAt quickly
        const lastQ = `
          SELECT MAX(created_at) AS last_message_at
          FROM thread_messages
          WHERE thread_id = $1
        `;
        const lastRes = await pool.query<{ last_message_at: string | null }>(lastQ, [existingId]);

        return {
          created: false,
          thread: {
            id: existingId,
            lastMessageAt: lastRes.rows[0]?.last_message_at ?? null,
            participants,
          },
        };
      }
    }

    // Create thread transactionally
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const tq = `
        INSERT INTO threads (created_by)
        VALUES ($1)
        RETURNING id, created_at
      `;
      const tres = await client.query<{ id: string; created_at: string }>(tq, [createdBy]);
      const threadId = tres.rows[0].id;

      const insP = `
        INSERT INTO thread_participants (thread_id, user_id)
        SELECT $1, x
        FROM UNNEST($2::uuid[]) AS x
        ON CONFLICT (thread_id, user_id) DO NOTHING
      `;
      await client.query(insP, [threadId, allUserIds]);

      await client.query("COMMIT");

      // Return thread shape
      const allUsers = await getUsersByIds(allUserIds);
      const participants = allUsers
        .map((u) => ({ email: u.email }))
        .sort((a, b) => a.email.localeCompare(b.email));

      return {
        created: true,
        thread: {
          id: threadId,
          lastMessageAt: null,
          participants,
        },
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async isParticipant(threadId: string, userId: string): Promise<boolean> {
    const q = `
      SELECT 1
      FROM thread_participants
      WHERE thread_id = $1 AND user_id = $2
      LIMIT 1
    `;
    const res = await pool.query(q, [threadId, userId]);
    return res.rowCount === 1;
  },

  /**
   * List messages with pagination:
   * - limit: default 50, max 100
   * - before: ISO cursor, older than this createdAt
   * Returns messages in ascending order for UI.
   */
  async listMessages(
    threadId: string,
    userId: string,
    opts?: { limit?: number; before?: string }
  ): Promise<{ messages: ThreadMessage[]; nextBefore: string | null }> {
    const isP = await this.isParticipant(threadId, userId);
    if (!isP) throw Object.assign(new Error("Not a participant"), { code: "FORBIDDEN" });

    const limit = parseLimit(opts?.limit, 50);
    const before = opts?.before ? String(opts.before) : null;

    const q = `
      SELECT id, thread_id, body, created_by, created_at
      FROM thread_messages
      WHERE thread_id = $1
        AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
      ORDER BY created_at DESC
      LIMIT $3
    `;
    const res = await pool.query<{
      id: string;
      thread_id: string;
      body: string;
      created_by: string;
      created_at: string;
    }>(q, [threadId, before, limit]);

    // Reverse back to ASC for UI
    const rows = [...res.rows].reverse();

    const messages = rows.map((r) => ({
      id: r.id,
      threadId: r.thread_id,
      body: r.body,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }));

    const nextBefore = res.rows.length ? res.rows[res.rows.length - 1].created_at : null;

    return { messages, nextBefore };
  },

  async createMessage(threadId: string, userId: string, body: unknown): Promise<ThreadMessage> {
    const isP = await this.isParticipant(threadId, userId);
    if (!isP) throw Object.assign(new Error("Not a participant"), { code: "FORBIDDEN" });

    const text = String(body ?? "").trim();
    if (!text) throw Object.assign(new Error("body is required"), { code: "VALIDATION" });

    const q = `
      INSERT INTO thread_messages (thread_id, body, created_by)
      VALUES ($1, $2, $3)
      RETURNING id, thread_id, body, created_by, created_at
    `;
    const res = await pool.query<{
      id: string;
      thread_id: string;
      body: string;
      created_by: string;
      created_at: string;
    }>(q, [threadId, text, userId]);

    const r = res.rows[0];
    return {
      id: r.id,
      threadId: r.thread_id,
      body: r.body,
      createdBy: r.created_by,
      createdAt: r.created_at,
    };
  },
};
