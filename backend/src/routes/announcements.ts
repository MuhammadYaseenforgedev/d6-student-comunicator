import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { announcementRepo } from "../repos/announcementRepo";

export const announcementRouter = Router();

// List announcements for a channel
announcementRouter.get("/channels/:channelId/announcements", (req, res) => {
  const { channelId } = req.params;
  const list = announcementRepo.listByChannel(channelId);
  res.json(list);
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

    const created = announcementRepo.create({
      channelId,
      title,
      body,
      pinned,
      createdBy: req.user!.id,
    });

    return res.status(201).json(created);
  }
);
