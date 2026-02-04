import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";

export const eventRouter = Router();

// List events for a channel
eventRouter.get("/channels/:channelId/events", (req, res) => {
  const { channelId } = req.params as { channelId: string };
  const list = repos.events.listByChannel(channelId);
  return res.json(list);
});

// Create event (ADMIN, LECTURER)
eventRouter.post(
  "/channels/:channelId/events",
  requireRole("ADMIN", "LECTURER"),
  (req, res) => {
    const { channelId } = req.params as { channelId: string };
    const { title, description, location, startsAt, endsAt } = req.body as {
      title?: string;
      description?: string;
      location?: string;
      startsAt?: string;
      endsAt?: string;
    };

    if (!title || !startsAt || !endsAt) {
      return res
        .status(400)
        .json({ error: "Missing title, startsAt, or endsAt" });
    }

    try {
      const created = repos.events.create({
        channelId,
        title,
        description,
        location,
        startsAt,
        endsAt,
        createdBy: req.user!.id,
      });

      return res.status(201).json(created);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : "Invalid event input",
      });
    }
  }
);

// Delete event (ADMIN, LECTURER)
eventRouter.delete(
  "/channels/:channelId/events/:eventId",
  requireRole("ADMIN", "LECTURER"),
  (req, res) => {
    const { eventId } = req.params as { eventId: string };
    const ok = repos.events.delete(eventId);

    if (!ok) return res.status(404).json({ error: "Event not found" });
    return res.status(204).send();
  }
);
