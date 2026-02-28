import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";
import { pool } from "../config/db";

export const announcementRouter = Router();

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

type ChannelAccess = {
  exists: boolean;
  isPrivate: boolean;
  isMember: boolean;
};

async function getChannelAccess(channelId: string, userId: string): Promise<ChannelAccess> {
  const q = `
    SELECT
      c.is_private AS "isPrivate",
      EXISTS(
        SELECT 1
        FROM channel_members cm
        WHERE cm.channel_id = c.id AND cm.user_id = $2
      ) AS "isMember"
    FROM channels c
    WHERE c.id = $1
    LIMIT 1
  `;
  const r = await pool.query<{ isPrivate: boolean; isMember: boolean }>(q, [channelId, userId]);
  if ((r.rowCount ?? 0) === 0) return { exists: false, isPrivate: false, isMember: false };
  return { exists: true, isPrivate: Boolean(r.rows[0].isPrivate), isMember: Boolean(r.rows[0].isMember) };
}

function canViewChannel(role: string, access: ChannelAccess): boolean {
  const R = String(role ?? "").toUpperCase();
  if (R === "ADMIN" || R === "LECTURER") return true;
  if (!access.exists) return false;

  if (R === "PARENT") return !access.isPrivate; // public only
  // STUDENT
  return !access.isPrivate || access.isMember;
}

function cleanOptionalText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : "";
}

// List announcements for a channel (all logged-in roles, including PARENT)
announcementRouter.get(
  "/channels/:channelId/announcements",
  requireRole("ADMIN", "LECTURER", "STUDENT", "PARENT"),
  async (req, res) => {
    try {
      const user = req.user!;
      const { channelId } = req.params as { channelId: string };

      const access = await getChannelAccess(channelId, user.id);
      if (!access.exists) return err(res, 404, "NOT_FOUND", "Channel not found");
      if (!canViewChannel(user.role, access)) {
        return err(res, 403, "FORBIDDEN", "You do not have access to this channel");
      }

      const list = await repos.announcements.listByChannel(channelId);
      return res.json(list);
    } catch (e: any) {
      console.error("[announcements] GET error", e);
      return err(res, 500, "INTERNAL", "Failed to list announcements");
    }
  }
);

// Create announcement (ADMIN, LECTURER)
announcementRouter.post(
  "/channels/:channelId/announcements",
  requireRole("ADMIN", "LECTURER"),
  async (req, res) => {
    try {
      const { channelId } = req.params as { channelId: string };
      const { title, body, pinned } = req.body as {
        title?: string;
        body?: string;
        pinned?: boolean;
      };

      if (!title || !body) {
        return err(res, 400, "VALIDATION", "Missing title or body");
      }

      // Ensure channel exists (clean 404 instead of creating orphaned records)
      const access = await getChannelAccess(channelId, req.user!.id);
      if (!access.exists) return err(res, 404, "NOT_FOUND", "Channel not found");

      const created = await repos.announcements.create({
        channelId,
        title: title.trim(),
        body: body.trim(),
        pinned: Boolean(pinned),
        createdBy: req.user!.id,
      });

      return res.status(201).json(created);
    } catch (e: any) {
      console.error("[announcements] POST error", e);
      return err(res, 500, "INTERNAL", "Failed to create announcement");
    }
  }
);

// Update announcement (ADMIN, LECTURER)
announcementRouter.patch(
  "/channels/:channelId/announcements/:announcementId",
  requireRole("ADMIN", "LECTURER"),
  async (req, res) => {
    try {
      const { channelId, announcementId } = req.params as {
        channelId: string;
        announcementId: string;
      };

      const titleRaw = cleanOptionalText(req.body?.title);
      const bodyRaw = cleanOptionalText(req.body?.body);
      const pinnedRaw = req.body?.pinned;

      const hasTitle = typeof titleRaw === "string";
      const hasBody = typeof bodyRaw === "string";
      const hasPinned = typeof pinnedRaw === "boolean";

      if (!hasTitle && !hasBody && !hasPinned) {
        return err(
          res,
          400,
          "VALIDATION",
          "Provide at least one of: title, body, pinned"
        );
      }

      if (titleRaw === "") return err(res, 400, "VALIDATION", "title cannot be empty");
      if (bodyRaw === "") return err(res, 400, "VALIDATION", "body cannot be empty");

      const updated = await repos.announcements.update({
        id: announcementId,
        channelId,
        title: hasTitle ? titleRaw : undefined,
        body: hasBody ? bodyRaw : undefined,
        pinned: hasPinned ? Boolean(pinnedRaw) : undefined,
      });

      if (!updated) return err(res, 404, "NOT_FOUND", "Announcement not found");

      return res.json(updated);
    } catch (e: any) {
      console.error("[announcements] PATCH error", e);
      return err(res, 500, "INTERNAL", "Failed to update announcement");
    }
  }
);

// Delete announcement (ADMIN, LECTURER)
announcementRouter.delete(
  "/channels/:channelId/announcements/:announcementId",
  requireRole("ADMIN", "LECTURER"),
  async (req, res) => {
    try {
      const { channelId, announcementId } = req.params as {
        channelId: string;
        announcementId: string;
      };

      const ok = await repos.announcements.delete(announcementId, channelId);
      if (!ok) return err(res, 404, "NOT_FOUND", "Announcement not found");

      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[announcements] DELETE error", e);
      return err(res, 500, "INTERNAL", "Failed to delete announcement");
    }
  }
);
