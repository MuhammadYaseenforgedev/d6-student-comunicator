import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";
import type { ChannelType } from "../models/channel";

export const channelRouter = Router();

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

// List channels (all logged-in roles)
channelRouter.get("/", requireRole("ADMIN", "LECTURER", "STUDENT", "PARENT"), async (req, res) => {
  try {
    const user = req.user!;
    const role = String(user.role ?? "").toUpperCase();

    const list = await repos.channels.list();

    // ADMIN/LECTURER can see everything
    if (role === "ADMIN" || role === "LECTURER") {
      return res.json(list);
    }

    // PARENT: safest default is public channels only
    if (role === "PARENT") {
      const filtered = list.filter((c) => !c.isPrivate);
      return res.json(filtered);
    }

    // STUDENT: public + private channels they are a member of
    const filtered = list.filter((c) => !c.isPrivate || (Array.isArray(c.members) && c.members.includes(user.id)));
    return res.json(filtered);
  } catch (e: any) {
    console.error("[channels] GET / error", e);
    return err(res, 500, "INTERNAL", "Failed to list channels");
  }
});

// Create channel (ADMIN, LECTURER)
channelRouter.post("/", requireRole("ADMIN", "LECTURER"), async (req, res) => {
  try {
    const { name, type, isPrivate } = req.body as {
      name?: string;
      type?: ChannelType;
      isPrivate?: boolean;
    };

    if (!name || !type) {
      return err(res, 400, "VALIDATION", "Missing name or type");
    }

    const created = await repos.channels.create({
      name: name.trim(),
      type,
      isPrivate: Boolean(isPrivate),
      createdBy: req.user!.id,
    });

    return res.status(201).json(created);
  } catch (e: any) {
    console.error("[channels] POST / error", e);
    return err(res, 500, "INTERNAL", "Failed to create channel");
  }
});

// Join channel (STUDENT)
channelRouter.post("/:id/join", requireRole("STUDENT"), async (req, res) => {
  try {
    const { id } = req.params as { id: string };

    const updated = await repos.channels.join(id, req.user!.id);
    if (!updated) {
      return err(res, 404, "NOT_FOUND", "Channel not found");
    }

    return res.json(updated);
  } catch (e: any) {
    console.error("[channels] POST /:id/join error", e);
    return err(res, 500, "INTERNAL", "Failed to join channel");
  }
});
