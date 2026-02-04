import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { messageRepo } from "../repos/messageRepo";

export const messageRouter = Router();

// GET: list messages for a channel
messageRouter.get("/channels/:channelId/messages", (req, res) => {
  const { channelId } = req.params as { channelId: string };
  const list = messageRepo.listByChannel(channelId);
  return res.json(list);
});

// POST: create message (everyone logged in can post)
messageRouter.post(
  "/channels/:channelId/messages",
  requireRole("ADMIN", "LECTURER", "STUDENT"),
  (req, res) => {
    const { channelId } = req.params as { channelId: string };
    const { body } = req.body as { body?: string };

    if (!body || !body.trim()) {
      return res.status(400).json({ error: "Missing body" });
    }

    const created = messageRepo.create({
      channelId,
      body: body.trim(),
      createdBy: req.user!.id,
    });

    return res.status(201).json(created);
  }
);

// DELETE: moderation (ADMIN, LECTURER)
messageRouter.delete(
  "/channels/:channelId/messages/:messageId",
  requireRole("ADMIN", "LECTURER"),
  (req, res) => {
    const { messageId } = req.params as { messageId: string };
    const ok = messageRepo.delete(messageId);

    if (!ok) return res.status(404).json({ error: "Message not found" });
    return res.status(204).send();
  }
);

