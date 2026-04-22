import { Router } from "express";
import { requireAccess, requireRole } from "../middleware/rbac";
import { repos } from "../persistence";
import { pool } from "../config/db";

export const eventRouter = Router();

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

async function assertEventBelongsToChannel(eventId: string, channelId: string): Promise<boolean> {
  const q = `
    SELECT 1
    FROM events
    WHERE id = $1 AND channel_id = $2
    LIMIT 1
  `;
  const r = await pool.query(q, [eventId, channelId]);
  return (r.rowCount ?? 0) > 0;
}

// List events for a channel (all logged-in roles incl PARENT)
eventRouter.get(
  "/channels/:channelId/events",
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

      const list = await repos.events.listByChannel(channelId);
      return res.json(list);
    } catch (e: any) {
      console.error("[events] GET error", e);
      return err(res, 500, "INTERNAL", "Failed to list events");
    }
  }
);

// Create event (ADMIN, LECTURER)
eventRouter.post(
  "/channels/:channelId/events",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const { channelId } = req.params as { channelId: string };
      const { title, description, location, startsAt, endsAt } = req.body as {
        title?: string;
        description?: string;
        location?: string;
        startsAt?: string;
        endsAt?: string;
      };

      if (!title || !startsAt || !endsAt) {
        return err(res, 400, "VALIDATION", "Missing title, startsAt, or endsAt");
      }

      // Ensure channel exists
      const access = await getChannelAccess(channelId, req.user!.id);
      if (!access.exists) return err(res, 404, "NOT_FOUND", "Channel not found");

      const created = await repos.events.create({
        channelId,
        title: title.trim(),
        description,
        location,
        startsAt,
        endsAt,
        createdBy: req.user!.id,
      });

      return res.status(201).json(created);
    } catch (e: any) {
      console.error("[events] POST error", e);
      return err(res, 500, "INTERNAL", "Failed to create event");
    }
  }
);

// PATCH event (ADMIN, LECTURER)
eventRouter.patch(
  "/channels/:channelId/events/:eventId",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const { channelId, eventId } = req.params as { channelId: string; eventId: string };

      const { title, description, location, startsAt, endsAt } = req.body as {
        title?: string;
        description?: string | null;
        location?: string | null;
        startsAt?: string;
        endsAt?: string;
      };

      if (title !== undefined && !title.trim()) {
        return err(res, 400, "VALIDATION", "Title cannot be empty");
      }

      if ((startsAt && !endsAt) || (!startsAt && endsAt)) {
        return err(res, 400, "VALIDATION", "Provide both startsAt and endsAt together");
      }

      // Ensure channel exists
      const access = await getChannelAccess(channelId, req.user!.id);
      if (!access.exists) return err(res, 404, "NOT_FOUND", "Channel not found");

      // Ensure event is in this channel (prevents IDOR via eventId)
      const okChannel = await assertEventBelongsToChannel(eventId, channelId);
      if (!okChannel) return err(res, 404, "NOT_FOUND", "Event not found in this channel");

      const updated = await repos.events.update({
        eventId,
        title: title?.trim(),
        description,
        location,
        startsAt,
        endsAt,
      });

      if (!updated) return err(res, 404, "NOT_FOUND", "Event not found");
      return res.json(updated);
    } catch (e: any) {
      console.error("[events] PATCH error", e);
      return err(res, 500, "INTERNAL", "Failed to update event");
    }
  }
);

// Delete event (ADMIN, LECTURER)
eventRouter.delete(
  "/channels/:channelId/events/:eventId",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const { channelId, eventId } = req.params as { channelId: string; eventId: string };

      // Ensure channel exists
      const access = await getChannelAccess(channelId, req.user!.id);
      if (!access.exists) return err(res, 404, "NOT_FOUND", "Channel not found");

      // Ensure event is in this channel (prevents IDOR via eventId)
      const okChannel = await assertEventBelongsToChannel(eventId, channelId);
      if (!okChannel) return err(res, 404, "NOT_FOUND", "Event not found in this channel");

      const ok = await repos.events.delete(eventId);
      if (!ok) return err(res, 404, "NOT_FOUND", "Event not found");

      return res.status(204).send();
    } catch (e: any) {
      console.error("[events] DELETE error", e);
      return err(res, 500, "INTERNAL", "Failed to delete event");
    }
  }
);
