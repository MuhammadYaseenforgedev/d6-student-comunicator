import { Router } from "express";
import { pgCalendarRepo } from "../repos/pgCalendarRepo";
import { pool } from "../config/db";

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

export const calendarRouter = Router();

// requireAuth is already applied globally in app.ts

async function parentHasChild(parentId: string, childId: string): Promise<boolean> {
  const q = `
    SELECT 1
    FROM parent_links
    WHERE parent_user_id = $1 AND student_user_id = $2
    LIMIT 1
  `;
  const r = await pool.query(q, [parentId, childId]);
  return (r.rowCount ?? 0) > 0;
}

// GET /calendar?limit= & (optional) childId= (PARENT only)
calendarRouter.get("/calendar", async (req, res) => {
  try {
    const user = req.user!;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    let targetUserId = user.id;

    // Parents can view a linked child calendar by providing childId
    if (user.role === "PARENT") {
      const childId = String(req.query.childId ?? "").trim();
      if (!childId) {
        return err(res, 400, "VALIDATION", "childId is required for parent calendar view");
      }

      const ok = await parentHasChild(user.id, childId);
      if (!ok) return err(res, 403, "FORBIDDEN", "Parent is not linked to this child");

      targetUserId = childId;
    } else {
      // Non-parents: ignore childId if someone tries to pass it
      // They can only see their own calendar.
    }

    const entries = await pgCalendarRepo.listForUser(targetUserId, { limit });
    return res.json({ value: entries, count: entries.length });
  } catch {
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// POST /calendar
calendarRouter.post("/calendar", async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === "PARENT") {
      return err(res, 403, "FORBIDDEN", "Parents cannot create calendar entries");
    }

    const created = await pgCalendarRepo.createForUser(user.id, {
      title: req.body?.title,
      description: req.body?.description ?? null,
      location: req.body?.location ?? null,
      startsAt: req.body?.startsAt,
      endsAt: req.body?.endsAt,
    });

    return res.status(201).json(created);
  } catch (e: any) {
    if (e?.code === "VALIDATION") {
      return err(res, 400, "VALIDATION", e.message ?? "Invalid request");
    }
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// DELETE /calendar/:id
calendarRouter.delete("/calendar/:id", async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === "PARENT") {
      return err(res, 403, "FORBIDDEN", "Parents cannot delete calendar entries");
    }

    const id = req.params.id;

    const ok = await pgCalendarRepo.deleteForUser(user.id, id);
    if (!ok) return err(res, 404, "NOT_FOUND", "Calendar entry not found");

    return res.status(204).send();
  } catch (e: any) {
    if (e?.code === "VALIDATION") {
      return err(res, 400, "VALIDATION", e.message ?? "Invalid request");
    }
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});
