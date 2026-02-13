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
};

type ParticipantRow = {
  thread_id: string;
  email: string;
};

type UserRow = {
  id: string;
  email: string;
};

type ThreadMessageRow = {
  id: string;
  thread_id: string;
  body: string;
  created_by: string;
  created_at: string;
};

export const pgThreadRepo = {
  async listForUser(userId: string): Promise<Thread[]> {
    const q = `
      SELECT t.id,
             t.created_at,
             MAX(tm.created_at) AS last_message_at
      FROM threads t
      JOIN thread_participants tp ON tp.thread_id = t.id
      LEFT JOIN thread_messages tm ON tm.thread_id = t.id
      WHERE tp.user_id = $1
      GROUP BY t.id, t.created_at
      ORDER BY COALESCE(MAX(tm.created_at), t.created_at) DESC
    `;

    const res = await pool.query<ThreadRow>(q, [userId]);
    const threadRows = res.rows;

    if (threadRows.length === 0) return [];

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

    return threadRows.map((t) => ({
      id: t.id,
      lastMessageAt: t.last_message_at,
      participants: participantsByThread.get(t.id) ?? [],
    }));
  },

  async createThread(createdBy: string, participantEmails: string[]): Promise<Thread> {
    const cleaned = participantEmails
      .map((e) => String(e).trim().toLowerCase())
      .filter((e) => e.length > 0);

    const uniqueEmails = Array.from(new Set(cleaned));

    if (uniqueEmails.length === 0) {
      throw new Error("participantEmails is required");
    }

    // Load users by email
    const uq = `
      SELECT id, email
      FROM users
      WHERE lower(email) = ANY($1::text[])
    `;
    const ures = await pool.query<UserRow>(uq, [uniqueEmails]);

    if (ures.rowCount !== uniqueEmails.length) {
      throw new Error("One or more participant emails do not exist");
    }

    const participantUserIds = ures.rows.map((u) => u.id);

    // Always include creator as participant
    const allUserIds = Array.from(new Set([createdBy, ...participantUserIds]));

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

      const participants = ures.rows
        .map((u) => ({ email: u.email }))
        .sort((a, b) => a.email.localeCompare(b.email));

      return {
        id: threadId,
        lastMessageAt: null,
        participants,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async listMessages(threadId: string, userId: string): Promise<ThreadMessage[]> {
    const isP = await this.isParticipant(threadId, userId);
    if (!isP) throw new Error("FORBIDDEN");

    const q = `
      SELECT id, thread_id, body, created_by, created_at
      FROM thread_messages
      WHERE thread_id = $1
      ORDER BY created_at ASC
    `;
    const res = await pool.query<ThreadMessageRow>(q, [threadId]);

    return res.rows.map((r) => ({
      id: r.id,
      threadId: r.thread_id,
      body: r.body,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }));
  },

  async createMessage(threadId: string, userId: string, body: string): Promise<ThreadMessage> {
    const isP = await this.isParticipant(threadId, userId);
    if (!isP) throw new Error("FORBIDDEN");

    const text = String(body ?? "").trim();
    if (!text) throw new Error("body is required");

    const q = `
      INSERT INTO thread_messages (thread_id, body, created_by)
      VALUES ($1, $2, $3)
      RETURNING id, thread_id, body, created_by, created_at
    `;
    const res = await pool.query<ThreadMessageRow>(q, [threadId, text, userId]);

    const r = res.rows[0];
    return {
      id: r.id,
      threadId: r.thread_id,
      body: r.body,
      createdBy: r.created_by,
      createdAt: r.created_at,
    };
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
};
