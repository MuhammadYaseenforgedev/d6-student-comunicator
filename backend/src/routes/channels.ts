import { Router } from "express";
import { randomUUID } from "crypto";
import { channels } from "../store/channelStore";
import { Channel, ChannelType } from "../models/channel";
import { requireRole } from "../middleware/rbac";

export const channelRouter = Router();

// List channels (everyone)
channelRouter.get("/", (_req, res) => {
  res.json(channels);
});

// Create channel (ADMIN, LECTURER)
channelRouter.post("/", requireRole("ADMIN", "LECTURER"), (req, res) => {
  const { name, type, isPrivate } = req.body as {
    name?: string;
    type?: ChannelType;
    isPrivate?: boolean;
  };

  if (!name || !type) {
    return res.status(400).json({ error: "Missing name or type" });
  }

  const channel: Channel = {
    id: randomUUID(),
    name,
    type,
    isPrivate: Boolean(isPrivate),
    createdBy: req.user!.id,
    members: [],
    createdAt: new Date().toISOString(),
  };

  channels.push(channel);
  return res.status(201).json(channel);
});

// Join channel (STUDENT)
channelRouter.post("/:id/join", requireRole("STUDENT"), (req, res) => {
  const channel = channels.find((c) => c.id === req.params.id);
  if (!channel) return res.status(404).json({ error: "Channel not found" });

  if (!channel.members.includes(req.user!.id)) {
    channel.members.push(req.user!.id);
  }

  return res.json(channel);
});
