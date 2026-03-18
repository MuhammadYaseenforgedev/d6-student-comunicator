import { Router } from "express";
import { pgCalendarRepo } from "../repos/pgCalendarRepo";
import { pool } from "../config/db";

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function parseLimit(raw: unknown, fallback = 50) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

function parseDate(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function normalizeRole(raw: unknown): "ADMIN" | "LECTURER" | "STUDENT" | "PARENT" {
  const role = String(raw ?? "").trim().toUpperCase();
  if (role === "ADMIN" || role === "LECTURER" || role === "PARENT") return role;
  return "STUDENT";
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
    const limit = parseLimit(req.query.limit, 50);
    const date = parseDate(req.query.date);
    if (date === null) return err(res, 400, "VALIDATION", "date must be YYYY-MM-DD");

    let targetUserId = user.id;
    let targetRole: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT" = normalizeRole(user.role);

    // Parents can view a linked child calendar by providing childId
    if (user.role === "PARENT") {
      const childId = String(req.query.childId ?? "").trim();
      if (!childId) return err(res, 400, "VALIDATION", "childId is required for parent calendar view");
      if (!isUuid(childId)) return err(res, 400, "VALIDATION", "childId must be a UUID");

      const ok = await parentHasChild(user.id, childId);
      if (!ok) return err(res, 403, "FORBIDDEN", "Parent is not linked to this child");

      targetUserId = childId;
      targetRole = "STUDENT";
    } else {
      // Non-parents can only see their own calendar.
      targetUserId = user.id;
    }

    const entries = await pgCalendarRepo.listForUser(targetUserId, {
      limit,
      date: date || undefined,
      role: targetRole,
    });
    return res.json({ value: entries, count: entries.length });
  } catch (e: any) {
    console.error("[calendar] GET /calendar error", e);
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// POST /calendar
calendarRouter.post("/calendar", async (req, res) => {
  try {
    const user = req.user!;

    // Parent is view-only; STUDENT/LECTURER/ADMIN can create their own entries.
    if (!(user.role === "STUDENT" || user.role === "LECTURER" || user.role === "ADMIN")) {
      return err(
        res,
        403,
        "FORBIDDEN",
        "Only STUDENT, LECTURER, or ADMIN can create calendar entries"
      );
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
    console.error("[calendar] POST /calendar error", e);
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// DELETE /calendar/:id
calendarRouter.delete("/calendar/:id", async (req, res) => {
  try {
    const user = req.user!;

    // Parent is view-only; STUDENT/LECTURER/ADMIN can delete their own entries.
    if (!(user.role === "STUDENT" || user.role === "LECTURER" || user.role === "ADMIN")) {
      return err(
        res,
        403,
        "FORBIDDEN",
        "Only STUDENT, LECTURER, or ADMIN can delete calendar entries"
      );
    }

    const id = String(req.params.id ?? "").trim();
    if (!id) return err(res, 400, "VALIDATION", "Invalid calendar entry id");

    const ok = await pgCalendarRepo.deleteForUser(user.id, id);
    if (!ok) return err(res, 404, "NOT_FOUND", "Calendar entry not found");

    return res.status(204).send();
  } catch (e: any) {
    if (e?.code === "VALIDATION") {
      return err(res, 400, "VALIDATION", e.message ?? "Invalid request");
    }
    console.error("[calendar] DELETE /calendar/:id error", e);
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});
