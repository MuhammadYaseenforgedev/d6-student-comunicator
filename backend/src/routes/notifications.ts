import { Router } from "express";
import { pool } from "../config/db";
import { syncFinanceStatusNotificationsForUser } from "../lib/notifications";
import { repos } from "../persistence";
import type { NotificationCategory } from "../persistence/types";

export const notificationRouter = Router();

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function parseLimit(raw: unknown, fallback = 50): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

function normalizeCategories(raw: unknown): NotificationCategory[] {
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const out: NotificationCategory[] = [];

  for (const value of values) {
    const category = String(value ?? "").trim().toUpperCase() as NotificationCategory;
    if (!category) continue;
    if (!out.includes(category)) out.push(category);
  }

  return out;
}

async function pruneStaleAnnouncementNotifications(userId: string): Promise<void> {
  await pool.query(
    `
      DELETE FROM user_notifications un
      WHERE un.user_id = $1
        AND un.source_key LIKE 'announcement:%'
        AND NOT EXISTS (
          SELECT 1
          FROM announcements a
          WHERE a.id::text = split_part(un.source_key, ':', 2)
        )
    `,
    [userId]
  );
}

notificationRouter.get("/summary", async (req, res) => {
  try {
    const user = req.user!;
    await pruneStaleAnnouncementNotifications(user.id);
    await syncFinanceStatusNotificationsForUser(user);
    const summary = await repos.notifications.getUnreadSummary(user.id);
    return res.json(summary);
  } catch (e) {
    console.error("[notifications] GET /summary error", e);
    return err(res, 500, "INTERNAL", "Failed to load notification summary");
  }
});

notificationRouter.post("/read-all", async (req, res) => {
  try {
    const categories = normalizeCategories(req.body?.categories);
    const updated = await repos.notifications.markAllRead(req.user!.id, categories);
    return res.json({ ok: true, updated });
  } catch (e) {
    console.error("[notifications] POST /read-all error", e);
    return err(res, 500, "INTERNAL", "Failed to mark notifications as read");
  }
});

notificationRouter.post("/:id/read", async (req, res) => {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!id) return err(res, 400, "VALIDATION", "Notification id is required");

    const ok = await repos.notifications.markRead(req.user!.id, id);
    if (!ok) return err(res, 404, "NOT_FOUND", "Notification not found");
    return res.json({ ok: true });
  } catch (e) {
    console.error("[notifications] POST /:id/read error", e);
    return err(res, 500, "INTERNAL", "Failed to mark notification as read");
  }
});

notificationRouter.get("/", async (req, res) => {
  try {
    const user = req.user!;
    await pruneStaleAnnouncementNotifications(user.id);
    await syncFinanceStatusNotificationsForUser(user);

    const limit = parseLimit(req.query.limit, 50);
    const before = String(req.query.before ?? "").trim() || undefined;
    const unreadOnly = String(req.query.unreadOnly ?? "").trim().toLowerCase() === "true";
    const categories = normalizeCategories(req.query.category);

    const result = await repos.notifications.listForUser(user.id, {
      limit,
      before,
      unreadOnly,
      categories,
    });

    return res.json({
      value: result.items,
      count: result.items.length,
      nextBefore: result.nextBefore,
    });
  } catch (e) {
    console.error("[notifications] GET / error", e);
    return err(res, 500, "INTERNAL", "Failed to list notifications");
  }
});
