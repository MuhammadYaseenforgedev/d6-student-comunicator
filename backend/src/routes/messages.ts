import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";

export const messageRouter = Router();

// List messages for a channel
messageRouter.get("/channels/:channelId/messages", (req, res) => {
  const { channelId } = req.params as { channelId: string };
  const list = repos.messages.listByChannel(channelId);
  return res.json(list);
});

// Create message (ADMIN, LECTURER, STUDENT)
messageRouter.post(
  "/channels/:channelId/messages",
  requireRole("ADMIN", "LECTURER", "STUDENT"),
  (req, res) => {
    const { channelId } = req.params as { channelId: string };
    const { body } = req.body as { body?: string };

    if (!body || !body.trim()) {
      return res.status(400).json({ error: "Missing body" });
    }

    const created = repos.messages.create({
      channelId,
      body: body.trim(),
      createdBy: req.user!.id,
    });

    return res.status(201).json(created);
  }
);

// Delete message (moderation)
messageRouter.delete(
  "/channels/:channelId/messages/:messageId",
  requireRole("ADMIN", "LECTURER"),
  (req, res) => {
    const { messageId } = req.params as { messageId: string };
    const ok = repos.messages.delete(messageId);

    if (!ok) return res.status(404).json({ error: "Message not found" });
    return res.status(204).send();
  }
);
