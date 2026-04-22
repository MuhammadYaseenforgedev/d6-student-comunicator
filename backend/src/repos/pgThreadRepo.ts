import { pool } from "../config/db";
import { canMessage } from "../lib/messagingRbac";

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

/**
 * THREADS_MODE:
 * - "ANY" (default): repo only enforces participant access + integrity
 * - "D6": repo enforces that 1:1 threads obey D6 role matrix (no parent<->student, no self, no lecturer<->lecturer)
 *
 * Legacy compatibility:
 * - "PARENT_STUDENT" is treated as "D6" (so old env won't keep enabling parent-student threads)
 */
function threadsMode(): "ANY" | "D6" {
  const v = String(process.env.THREADS_MODE ?? "").trim().toUpperCase();
  if (v === "D6") return "D6";
  if (v === "PARENT_STUDENT") return "D6";
  return "ANY";
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

async function getThreadParticipantUserIds(threadId: string): Promise<string[]> {
  const q = `
    SELECT user_id
    FROM thread_participants
    WHERE thread_id = $1
  `;
  const res = await pool.query<{ user_id: string }>(q, [threadId]);
  return res.rows.map((r) => r.user_id);
}

function assertD6ThreadRolesOrThrow(users: UserRow[]) {
  // Repo only supports 1:1 DMs in D6 mode
  if (users.length !== 2) {
    throw Object.assign(new Error("Only 1:1 threads are supported"), { code: "FORBIDDEN" });
  }

  const a = users[0];
  const b = users[1];

  if (a.id === b.id) {
    throw Object.assign(new Error("Cannot create a thread with only yourself"), { code: "VALIDATION" });
  }

  // Must be allowed in both directions (our allowed pairs are symmetric)
  if (!canMessage(a.role, b.role) || !canMessage(b.role, a.role)) {
    throw Object.assign(new Error("Direct messaging is not allowed between these roles"), { code: "FORBIDDEN" });
  }
}

export const pgThreadRepo = {
  /**
   * List threads for a user with pagination.
   * - limit: max 100 (default 50)
   * - before: ISO timestamp cursor (older than this activity time)
   *
   * Soft-archive:
   * - threads where thread_participants.archived_at IS NOT NULL are hidden for that user
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
          AND tp.archived_at IS NULL
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
   *
   * Note: We do NOT block access just because archived.
   * If you want "archived means inaccessible", we can enforce that too.
   * Right now archived only hides from list, which is the safest behavior.
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
   * Archive a thread for a user (soft delete).
   * This hides it from /threads list for that user only.
   */
  async archiveForUser(threadId: string, userId: string): Promise<void> {
    const isP = await this.isParticipant(threadId, userId);
    if (!isP) throw Object.assign(new Error("Not a participant"), { code: "FORBIDDEN" });

    const q = `
      UPDATE thread_participants
      SET archived_at = NOW(), archived_by = $2
      WHERE thread_id = $1 AND user_id = $2
    `;
    await pool.query(q, [threadId, userId]);
  },

  /**
   * Unarchive a thread for a user (restore).
   */
  async unarchiveForUser(threadId: string, userId: string): Promise<void> {
    const isP = await this.isParticipant(threadId, userId);
    if (!isP) throw Object.assign(new Error("Not a participant"), { code: "FORBIDDEN" });

    const q = `
      UPDATE thread_participants
      SET archived_at = NULL, archived_by = NULL
      WHERE thread_id = $1 AND user_id = $2
    `;
    await pool.query(q, [threadId, userId]);
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

    // Load users by email (these are the "other participants" supplied by caller)
    const usersFromEmails = await getUsersByEmails(uniqueEmails);
    if (usersFromEmails.length !== uniqueEmails.length) {
      throw Object.assign(new Error("One or more participant emails do not exist"), { code: "VALIDATION" });
    }

    const participantUserIds = usersFromEmails.map((u) => u.id);

    // Always include creator
    const allUserIds = Array.from(new Set([createdBy, ...participantUserIds]));

    // Prevent self-only thread
    if (allUserIds.length < 2) {
      throw Object.assign(new Error("Cannot create a thread with only yourself"), { code: "VALIDATION" });
    }

    // Enforce 1:1 only at repo level too (keeps integrity)
    if (allUserIds.length !== 2) {
      throw Object.assign(new Error("Only 1:1 threads are supported"), { code: "VALIDATION" });
    }

    // Repo-level RBAC backstop (route checks too).
    const allUsers = await getUsersByIds(allUserIds);
    assertD6ThreadRolesOrThrow(allUsers);

    // Prevent duplicate 1:1 thread
    const existingId = await findExistingOneToOneThread(allUserIds[0], allUserIds[1]);
    if (existingId) {
      const participants = allUsers
        .map((u) => ({ email: u.email }))
        .sort((a, b) => a.email.localeCompare(b.email));

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

    // Create thread transactionally
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const tq = `
        INSERT INTO threads (created_by)
        VALUES ($1)
        RETURNING id
      `;
      const tres = await client.query<{ id: string }>(tq, [createdBy]);
      const threadId = tres.rows[0].id;

      const insP = `
        INSERT INTO thread_participants (thread_id, user_id)
        SELECT $1, x
        FROM UNNEST($2::uuid[]) AS x
        ON CONFLICT (thread_id, user_id) DO NOTHING
      `;
      await client.query(insP, [threadId, allUserIds]);

      await client.query("COMMIT");

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

    // Backstop: block non-D6 legacy threads if env is D6
    if (threadsMode() === "D6") {
      const ids = await getThreadParticipantUserIds(threadId);
      const users = await getUsersByIds(ids);
      assertD6ThreadRolesOrThrow(users);
    }

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

    const ids = await getThreadParticipantUserIds(threadId);
    const users = await getUsersByIds(ids);
    assertD6ThreadRolesOrThrow(users);

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
