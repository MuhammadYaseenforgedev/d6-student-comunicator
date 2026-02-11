import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";

export const eventRouter = Router();

// List events for a channel (read-only allowed for PARENT + STUDENT)
eventRouter.get(
  "/channels/:channelId/events",
  requireRole("ADMIN", "LECTURER", "STUDENT", "PARENT"),
  async (req, res) => {
    const { channelId } = req.params as { channelId: string };
    const list = await repos.events.listByChannel(channelId);
    return res.json(list);
  }
);

// Create event (ADMIN, LECTURER)
eventRouter.post(
  "/channels/:channelId/events",
  requireRole("ADMIN", "LECTURER"),
  async (req, res) => {
    const { channelId } = req.params as { channelId: string };
    const { title, description, location, startsAt, endsAt } = req.body as {
      title?: string;
      description?: string;
      location?: string;
      startsAt?: string;
      endsAt?: string;
    };

    if (!title || !startsAt || !endsAt) {
      return res.status(400).json({ error: "Missing title, startsAt, or endsAt" });
    }

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
  }
);

// PATCH event (ADMIN, LECTURER) partial update
eventRouter.patch(
  "/channels/:channelId/events/:eventId",
  requireRole("ADMIN", "LECTURER"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };

    const { title, description, location, startsAt, endsAt } = req.body as {
      title?: string;
      description?: string | null;
      location?: string | null;
      startsAt?: string;
      endsAt?: string;
    };

    // prevent empty title if provided
    if (title !== undefined && !title.trim()) {
      return res.status(400).json({ error: "Title cannot be empty" });
    }

    // If one date provided, require both
    if ((startsAt && !endsAt) || (!startsAt && endsAt)) {
      return res.status(400).json({
        error: "Provide both startsAt and endsAt together",
      });
    }

    const updated = await repos.events.update({
      eventId,
      title: title?.trim(),
      description,
      location,
      startsAt,
      endsAt,
    });

    if (!updated) return res.status(404).json({ error: "Event not found" });
    return res.json(updated);
  }
);

// Delete event (ADMIN, LECTURER)
eventRouter.delete(
  "/channels/:channelId/events/:eventId",
  requireRole("ADMIN", "LECTURER"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };
    const ok = await repos.events.delete(eventId);

    if (!ok) return res.status(404).json({ error: "Event not found" });
    return res.status(204).send();
  }
);
