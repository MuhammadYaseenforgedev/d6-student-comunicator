import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";

export const messageRouter = Router();

// List messages for a channel
messageRouter.get("/channels/:channelId/messages", async (req, res) => {
  const { channelId } = req.params as { channelId: string };

  try {
    const list = await repos.messages.listByChannel(channelId);
    return res.json(list);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to list messages",
    });
  }
});

// Create message (ADMIN, LECTURER, STUDENT)
messageRouter.post(
  "/channels/:channelId/messages",
  requireRole("ADMIN", "LECTURER", "STUDENT", "PARENT"),
  async (req, res) => {
    const { channelId } = req.params as { channelId: string };
    const { body } = req.body as { body?: string };

    if (!body || !body.trim()) {
      return res.status(400).json({ error: "Missing body" });
    }

    try {
      const created = await repos.messages.create({
        channelId,
        body: body.trim(),
        createdBy: req.user!.id,
      });

      return res.status(201).json(created);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to create message",
      });
    }
  }
);

// Delete message (moderation)
messageRouter.delete(
  "/channels/:channelId/messages/:messageId",
  requireRole("ADMIN", "LECTURER"),
  async (req, res) => {
    const { messageId } = req.params as { messageId: string };

    try {
      const ok = await repos.messages.delete(messageId);
      if (!ok) return res.status(404).json({ error: "Message not found" });
      return res.status(204).send();
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to delete message",
      });
    }
  }
);
