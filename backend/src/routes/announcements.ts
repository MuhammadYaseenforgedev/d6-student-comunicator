import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";

export const announcementRouter = Router();

// List announcements for a channel
announcementRouter.get("/channels/:channelId/announcements", (req, res) => {
  const { channelId } = req.params as { channelId: string };
  const list = repos.announcements.listByChannel(channelId);
  return res.json(list);
});

// Create announcement (ADMIN, LECTURER)
announcementRouter.post(
  "/channels/:channelId/announcements",
  requireRole("ADMIN", "LECTURER"),
  (req, res) => {
    const { channelId } = req.params as { channelId: string };
    const { title, body, pinned } = req.body as {
      title?: string;
      body?: string;
      pinned?: boolean;
    };

    if (!title || !body) {
      return res.status(400).json({ error: "Missing title or body" });
    }

    const created = repos.announcements.create({
      channelId,
      title,
      body,
      pinned: Boolean(pinned),
      createdBy: req.user!.id,
    });

    return res.status(201).json(created);
  }
);
