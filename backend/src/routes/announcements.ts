import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";

export const announcementRouter = Router();

// List announcements for a channel (all logged-in roles, including PARENT)
announcementRouter.get(
  "/channels/:channelId/announcements",
  requireRole("ADMIN", "LECTURER", "STUDENT", "PARENT"),
  async (req, res) => {
    const { channelId } = req.params as { channelId: string };
    const list = await repos.announcements.listByChannel(channelId);
    return res.json(list);
  }
);

// Create announcement (ADMIN, LECTURER)
announcementRouter.post(
  "/channels/:channelId/announcements",
  requireRole("ADMIN", "LECTURER"),
  async (req, res) => {
    const { channelId } = req.params as { channelId: string };
    const { title, body, pinned } = req.body as {
      title?: string;
      body?: string;
      pinned?: boolean;
    };

    if (!title || !body) {
      return res.status(400).json({ error: "Missing title or body" });
    }

    const created = await repos.announcements.create({
      channelId,
      title: title.trim(),
      body: body.trim(),
      pinned: Boolean(pinned),
      createdBy: req.user!.id,
    });

    return res.status(201).json(created);
  }
);
