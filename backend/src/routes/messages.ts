import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";
import { pool } from "../config/db";

export const messageRouter = Router();

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

function canViewChannelMessages(role: string, access: ChannelAccess): boolean {
  const R = String(role ?? "").toUpperCase();
  if (R === "ADMIN" || R === "LECTURER") return true;

  if (!access.exists) return false;

  if (R === "PARENT") {
    // safe default: parents only see public channels
    return !access.isPrivate;
  }

  // STUDENT
  return !access.isPrivate || access.isMember;
}

function canPostChannelMessages(role: string, access: ChannelAccess): boolean {
  const R = String(role ?? "").toUpperCase();
  if (R === "ADMIN" || R === "LECTURER") return true;
  if (R === "PARENT") return false;

  // STUDENT: same rule as viewing (public or member)
  return canViewChannelMessages(R, access);
}

// List messages for a channel
messageRouter.get(
  "/channels/:channelId/messages",
  requireRole("ADMIN", "LECTURER", "STUDENT", "PARENT"),
  async (req, res) => {
    const { channelId } = req.params as { channelId: string };

    try {
      const user = req.user!;
      const access = await getChannelAccess(channelId, user.id);

      if (!access.exists) return err(res, 404, "NOT_FOUND", "Channel not found");
      if (!canViewChannelMessages(user.role, access)) {
        return err(res, 403, "FORBIDDEN", "You do not have access to view messages for this channel");
      }

      const list = await repos.messages.listByChannel(channelId);
      return res.json(list);
    } catch (e: any) {
      console.error("[messages] GET /channels/:channelId/messages error", e);
      return err(res, 500, "INTERNAL", "Failed to list messages");
    }
  }
);

// Create message (ADMIN, LECTURER, STUDENT) — NOT PARENT (view-only)
messageRouter.post(
  "/channels/:channelId/messages",
  requireRole("ADMIN", "LECTURER", "STUDENT"),
  async (req, res) => {
    const { channelId } = req.params as { channelId: string };
    const { body } = req.body as { body?: string };

    if (!body || !body.trim()) {
      return err(res, 400, "VALIDATION", "Missing body");
    }

    try {
      const user = req.user!;
      const access = await getChannelAccess(channelId, user.id);

      if (!access.exists) return err(res, 404, "NOT_FOUND", "Channel not found");
      if (!canPostChannelMessages(user.role, access)) {
        return err(res, 403, "FORBIDDEN", "You do not have access to post messages in this channel");
      }

      const created = await repos.messages.create({
        channelId,
        body: body.trim(),
        createdBy: user.id,
      });

      return res.status(201).json(created);
    } catch (e: any) {
      console.error("[messages] POST /channels/:channelId/messages error", e);
      return err(res, 500, "INTERNAL", "Failed to create message");
    }
  }
);

// Delete message (moderation)
messageRouter.delete(
  "/channels/:channelId/messages/:messageId",
  requireRole("ADMIN", "LECTURER"),
  async (req, res) => {
    const { channelId, messageId } = req.params as { channelId: string; messageId: string };

    try {
      const user = req.user!;
      const access = await getChannelAccess(channelId, user.id);

      if (!access.exists) return err(res, 404, "NOT_FOUND", "Channel not found");
      if (!canViewChannelMessages(user.role, access) && String(user.role ?? "").toUpperCase() !== "ADMIN") {
        return err(res, 403, "FORBIDDEN", "You do not have access to moderate this channel");
      }

      // NOTE: pgMessageRepo.delete currently returns false always, so this will return 404.
      // That's okay for now if the UI isn't using delete.
      const ok = await repos.messages.delete(messageId);
      if (!ok) return err(res, 404, "NOT_FOUND", "Message not found");

      return res.status(204).send();
    } catch (e: any) {
      console.error("[messages] DELETE /channels/:channelId/messages/:messageId error", e);
      return err(res, 500, "INTERNAL", "Failed to delete message");
    }
  }
);
