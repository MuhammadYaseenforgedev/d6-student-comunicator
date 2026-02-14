import { Router } from "express";
import { pgCalendarRepo } from "../repos/pgCalendarRepo";

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

export const calendarRouter = Router();

// requireAuth is already applied globally in app.ts

// GET /calendar?limit=
calendarRouter.get("/calendar", async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const entries = await pgCalendarRepo.listForUser(userId, { limit });
    return res.json({ value: entries, count: entries.length });
  } catch {
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// POST /calendar
calendarRouter.post("/calendar", async (req, res) => {
  try {
    const userId = req.user!.id;

    const created = await pgCalendarRepo.createForUser(userId, {
      title: req.body?.title,
      description: req.body?.description ?? null,
      location: req.body?.location ?? null,
      startsAt: req.body?.startsAt,
      endsAt: req.body?.endsAt,
    });

    return res.status(201).json(created);
  } catch (e: any) {
    if (e?.code === "VALIDATION") return err(res, 400, "VALIDATION", e.message ?? "Invalid request");
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});
