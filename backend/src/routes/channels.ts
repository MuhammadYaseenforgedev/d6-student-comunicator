import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";
import type { ChannelType } from "../models/channel";

export const channelRouter = Router();

// List channels (everyone)
channelRouter.get("/", async (_req, res) => {
  const list = await repos.channels.list();
  res.json(list);
});

// Create channel (ADMIN, LECTURER)
channelRouter.post("/", requireRole("ADMIN", "LECTURER"), async (req, res) => {
  const { name, type, isPrivate } = req.body as {
    name?: string;
    type?: ChannelType;
    isPrivate?: boolean;
  };

  if (!name || !type) {
    return res.status(400).json({ error: "Missing name or type" });
  }

  const created = await repos.channels.create({
    name,
    type,
    isPrivate: Boolean(isPrivate),
    createdBy: req.user!.id,
  });

  return res.status(201).json(created);
});

// Join channel (STUDENT)
channelRouter.post("/:id/join", requireRole("STUDENT"), async (req, res) => {
  const { id } = req.params as { id: string };

  const updated = await repos.channels.join(id, req.user!.id);

  if (!updated) {
    return res.status(404).json({ error: "Channel not found" });
  }

  return res.json(updated);
});
