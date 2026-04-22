import { pool } from "../config/db";
import type {
  CreateNotificationInput,
  Notification,
  NotificationCategory,
  NotificationListOptions,
  NotificationListResult,
  NotificationRepo,
  NotificationSummary,
} from "../persistence/types";

type NotificationRow = {
  id: string;
  user_id: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  meta: Record<string, unknown> | null;
  source_key: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

function parseLimit(raw: unknown, fallback = 50) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    type: row.type,
    title: row.title,
    body: row.body,
    meta: row.meta ?? {},
    sourceKey: row.source_key,
    isRead: Boolean(row.is_read),
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

async function insertOne(input: CreateNotificationInput): Promise<void> {
  await pool.query(
    `
      INSERT INTO user_notifications (
        user_id,
        category,
        type,
        title,
        body,
        meta,
        source_key
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      ON CONFLICT (user_id, source_key) WHERE source_key IS NOT NULL
      DO NOTHING
    `,
    [
      input.userId,
      input.category,
      input.type,
      input.title,
      input.body ?? "",
      JSON.stringify(input.meta ?? {}),
      input.sourceKey ?? null,
    ]
  );
}

export const pgNotificationRepo: NotificationRepo = {
  async listForUser(userId: string, opts?: NotificationListOptions): Promise<NotificationListResult> {
    const limit = parseLimit(opts?.limit, 50);
    const before = String(opts?.before ?? "").trim() || null;
    const unreadOnly = opts?.unreadOnly === true;
    const categories = Array.isArray(opts?.categories)
      ? opts.categories.filter((value, index, array) => value && array.indexOf(value) === index)
      : [];

    const params: unknown[] = [userId];
    const where = [`user_id = $1`];

    if (before) {
      params.push(before);
      where.push(`created_at < $${params.length}::timestamptz`);
    }

    if (unreadOnly) {
      where.push(`is_read = false`);
    }

    if (categories.length > 0) {
      params.push(categories);
      where.push(`category = ANY($${params.length}::text[])`);
    }

    params.push(limit);

    const result = await pool.query<NotificationRow>(
      `
        SELECT
          id,
          user_id,
          category,
          type,
          title,
          body,
          meta,
          source_key,
          is_read,
          read_at,
          created_at
        FROM user_notifications
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT $${params.length}
      `,
      params
    );

    const items = result.rows.map(mapNotification);
    const nextBefore = items.length > 0 ? items[items.length - 1].createdAt : null;
    return { items, nextBefore };
  },

  async getUnreadSummary(userId: string): Promise<NotificationSummary> {
    const result = await pool.query<{ category: NotificationCategory; count: string }>(
      `
        SELECT category, COUNT(*)::text AS count
        FROM user_notifications
        WHERE user_id = $1
          AND is_read = false
        GROUP BY category
      `,
      [userId]
    );

    const counts: Partial<Record<NotificationCategory, number>> = {};
    let totalUnread = 0;

    for (const row of result.rows) {
      const count = Number(row.count ?? "0");
      counts[row.category] = count;
      totalUnread += count;
    }

    return { totalUnread, counts };
  },

  async createMany(inputs: CreateNotificationInput[]): Promise<void> {
    for (const input of inputs) {
      if (!input.userId || !input.title) continue;
      await insertOne(input);
    }
  },

  async upsert(input: CreateNotificationInput & { sourceKey: string }): Promise<Notification> {
    if (!input.sourceKey.trim()) {
      throw new Error("sourceKey is required for notification upsert");
    }

    const result = await pool.query<NotificationRow>(
      `
        INSERT INTO user_notifications (
          user_id,
          category,
          type,
          title,
          body,
          meta,
          source_key
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        ON CONFLICT (user_id, source_key) WHERE source_key IS NOT NULL
        DO UPDATE
        SET
          category = EXCLUDED.category,
          type = EXCLUDED.type,
          title = EXCLUDED.title,
          body = EXCLUDED.body,
          meta = EXCLUDED.meta,
          is_read = CASE
            WHEN (
              user_notifications.category IS DISTINCT FROM EXCLUDED.category
              OR user_notifications.type IS DISTINCT FROM EXCLUDED.type
              OR user_notifications.title IS DISTINCT FROM EXCLUDED.title
              OR user_notifications.body IS DISTINCT FROM EXCLUDED.body
              OR user_notifications.meta IS DISTINCT FROM EXCLUDED.meta
            )
            THEN false
            ELSE user_notifications.is_read
          END,
          read_at = CASE
            WHEN (
              user_notifications.category IS DISTINCT FROM EXCLUDED.category
              OR user_notifications.type IS DISTINCT FROM EXCLUDED.type
              OR user_notifications.title IS DISTINCT FROM EXCLUDED.title
              OR user_notifications.body IS DISTINCT FROM EXCLUDED.body
              OR user_notifications.meta IS DISTINCT FROM EXCLUDED.meta
            )
            THEN NULL
            ELSE user_notifications.read_at
          END,
          created_at = CASE
            WHEN (
              user_notifications.category IS DISTINCT FROM EXCLUDED.category
              OR user_notifications.type IS DISTINCT FROM EXCLUDED.type
              OR user_notifications.title IS DISTINCT FROM EXCLUDED.title
              OR user_notifications.body IS DISTINCT FROM EXCLUDED.body
              OR user_notifications.meta IS DISTINCT FROM EXCLUDED.meta
            )
            THEN now()
            ELSE user_notifications.created_at
          END
        RETURNING
          id,
          user_id,
          category,
          type,
          title,
          body,
          meta,
          source_key,
          is_read,
          read_at,
          created_at
      `,
      [
        input.userId,
        input.category,
        input.type,
        input.title,
        input.body ?? "",
        JSON.stringify(input.meta ?? {}),
        input.sourceKey,
      ]
    );

    return mapNotification(result.rows[0]);
  },

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await pool.query(
      `
        UPDATE user_notifications
        SET is_read = true,
            read_at = COALESCE(read_at, now())
        WHERE id = $1
          AND user_id = $2
      `,
      [notificationId, userId]
    );

    return (result.rowCount ?? 0) > 0;
  },

  async markAllRead(userId: string, categories?: NotificationCategory[]): Promise<number> {
    const normalizedCategories = Array.isArray(categories)
      ? categories.filter((value, index, array) => value && array.indexOf(value) === index)
      : [];

    const params: unknown[] = [userId];
    const where = [`user_id = $1`, `is_read = false`];

    if (normalizedCategories.length > 0) {
      params.push(normalizedCategories);
      where.push(`category = ANY($${params.length}::text[])`);
    }

    const result = await pool.query(
      `
        UPDATE user_notifications
        SET is_read = true,
            read_at = COALESCE(read_at, now())
        WHERE ${where.join(" AND ")}
      `,
      params
    );

    return result.rowCount ?? 0;
  },
};
