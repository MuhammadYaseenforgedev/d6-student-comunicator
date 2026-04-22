import { Router } from "express";
import { pool } from "../config/db";
import { isLecturerAssignedToCourse } from "../lib/courseAccess";
import { requireAccess } from "../middleware/rbac";
import { pgCalendarRepo } from "../repos/pgCalendarRepo";

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function parseLimit(raw: unknown, fallback = 50) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 250);
}

function parseDate(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function parseDateTime(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return "";

  const ts = Date.parse(v);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function normalizeOptionalText(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value ? value : null;
}

function hasOwn(body: unknown, key: string): boolean {
  return typeof body === "object" && body !== null && Object.prototype.hasOwnProperty.call(body, key);
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

async function validateCalendarCourseAccess(user: { id: string; role: string }, courseId: string) {
  if (!isUuid(courseId)) {
    return { ok: false as const, status: 400, code: "VALIDATION", message: "courseId must be a UUID" };
  }

  if (user.role === "STUDENT") {
    return {
      ok: false as const,
      status: 403,
      code: "FORBIDDEN",
      message: "Students can only manage personal calendar entries",
    };
  }

  const courseExists = await pool.query(
    `
      SELECT 1
      FROM courses
      WHERE id = $1
      LIMIT 1
    `,
    [courseId]
  );
  if ((courseExists.rowCount ?? 0) === 0) {
    return { ok: false as const, status: 404, code: "NOT_FOUND", message: "Course not found" };
  }

  if (user.role === "LECTURER") {
    const allowed = await isLecturerAssignedToCourse(pool, user.id, courseId);
    if (!allowed) {
      return {
        ok: false as const,
        status: 403,
        code: "FORBIDDEN",
        message: "Lecturer can only manage calendar items for assigned courses",
      };
    }
  }

  return { ok: true as const };
}

// GET /calendar?limit= & (optional) childId= (PARENT only)
calendarRouter.get(
  "/calendar",
  requireAccess({
    roles: ["ADMIN", "LECTURER", "STUDENT", "PARENT"],
    adminScopes: ["ACADEMIC", "SUPER"],
  }),
  async (req, res) => {
    try {
      const user = req.user!;
      const limit = parseLimit(req.query.limit, 50);
      const date = parseDate(req.query.date);
      if (date === null) return err(res, 400, "VALIDATION", "date must be YYYY-MM-DD");

      const start = parseDateTime(req.query.start);
      const end = parseDateTime(req.query.end);
      if (start === null) return err(res, 400, "VALIDATION", "start must be a valid ISO date/time");
      if (end === null) return err(res, 400, "VALIDATION", "end must be a valid ISO date/time");
      if (Boolean(start) !== Boolean(end)) {
        return err(res, 400, "VALIDATION", "start and end must be provided together");
      }
      if (start && end && Date.parse(end) <= Date.parse(start)) {
        return err(res, 400, "VALIDATION", "end must be after start");
      }

      let targetUserId = user.id;
      let targetRole: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT" = normalizeRole(user.role);

      // Parents can view a linked child calendar by providing childId.
      if (user.role === "PARENT") {
        const childId = String(req.query.childId ?? "").trim();
        if (!childId) return err(res, 400, "VALIDATION", "childId is required for parent calendar view");
        if (!isUuid(childId)) return err(res, 400, "VALIDATION", "childId must be a UUID");

        const ok = await parentHasChild(user.id, childId);
        if (!ok) return err(res, 403, "FORBIDDEN", "Parent is not linked to this child");

        targetUserId = childId;
        targetRole = "STUDENT";
      }

      const entries = await pgCalendarRepo.listForUser(targetUserId, {
        limit,
        date: date || undefined,
        start: start || undefined,
        end: end || undefined,
        role: targetRole,
      });
      return res.json({ value: entries, count: entries.length });
    } catch (e: any) {
      console.error("[calendar] GET /calendar error", e);
      return err(res, 500, "INTERNAL", "Unexpected error");
    }
  }
);

// POST /calendar
calendarRouter.post(
  "/calendar",
  requireAccess({ roles: ["ADMIN", "LECTURER", "STUDENT"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const user = req.user!;
      const courseId = String(req.body?.courseId ?? "").trim();

      // Parent is view-only; STUDENT/LECTURER/ADMIN can create their own entries.
      if (!(user.role === "STUDENT" || user.role === "LECTURER" || user.role === "ADMIN")) {
        return err(
          res,
          403,
          "FORBIDDEN",
          "Only STUDENT, LECTURER, or ADMIN can create calendar entries"
        );
      }

      if (courseId) {
        const check = await validateCalendarCourseAccess(user, courseId);
        if (!check.ok) {
          return err(res, check.status, check.code, check.message);
        }
      }

      const created = await pgCalendarRepo.createForUser(user.id, {
        title: req.body?.title,
        description: normalizeOptionalText(req.body?.description),
        location: normalizeOptionalText(req.body?.location),
        startsAt: req.body?.startsAt,
        endsAt: req.body?.endsAt,
        courseId: courseId || null,
      });

      return res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === "VALIDATION") {
        return err(res, 400, "VALIDATION", e.message ?? "Invalid request");
      }
      console.error("[calendar] POST /calendar error", e);
      return err(res, 500, "INTERNAL", "Unexpected error");
    }
  }
);

// PATCH /calendar/:id
calendarRouter.patch(
  "/calendar/:id",
  requireAccess({ roles: ["ADMIN", "LECTURER", "STUDENT"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const user = req.user!;

      if (!(user.role === "STUDENT" || user.role === "LECTURER" || user.role === "ADMIN")) {
        return err(
          res,
          403,
          "FORBIDDEN",
          "Only STUDENT, LECTURER, or ADMIN can update calendar entries"
        );
      }

      const id = String(req.params.id ?? "").trim();
      if (!id) return err(res, 400, "VALIDATION", "Invalid calendar entry id");

      const existing = await pgCalendarRepo.getEditableForUser(user.id, id, user.role);
      if (!existing) return err(res, 404, "NOT_FOUND", "Calendar entry not found");

      const nextCourseId = hasOwn(req.body, "courseId")
        ? String(req.body?.courseId ?? "").trim()
        : String(existing.courseId ?? "").trim();

      if (nextCourseId) {
        const check = await validateCalendarCourseAccess(user, nextCourseId);
        if (!check.ok) {
          return err(res, check.status, check.code, check.message);
        }
      }

      const updated = await pgCalendarRepo.updateForUser(user.id, id, user.role, {
        title: hasOwn(req.body, "title") ? req.body?.title : existing.title,
        description: hasOwn(req.body, "description")
          ? normalizeOptionalText(req.body?.description)
          : existing.description,
        location: hasOwn(req.body, "location")
          ? normalizeOptionalText(req.body?.location)
          : existing.location,
        startsAt: hasOwn(req.body, "startsAt") ? req.body?.startsAt : existing.startsAt,
        endsAt: hasOwn(req.body, "endsAt") ? req.body?.endsAt : existing.endsAt,
        courseId: nextCourseId || null,
      });
      if (!updated) return err(res, 404, "NOT_FOUND", "Calendar entry not found");

      return res.json(updated);
    } catch (e: any) {
      if (e?.code === "VALIDATION") {
        return err(res, 400, "VALIDATION", e.message ?? "Invalid request");
      }
      console.error("[calendar] PATCH /calendar/:id error", e);
      return err(res, 500, "INTERNAL", "Unexpected error");
    }
  }
);

// DELETE /calendar/:id
calendarRouter.delete(
  "/calendar/:id",
  requireAccess({ roles: ["ADMIN", "LECTURER", "STUDENT"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
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

      const ok = await pgCalendarRepo.deleteForUser(user.id, id, user.role);
      if (!ok) return err(res, 404, "NOT_FOUND", "Calendar entry not found");

      return res.status(204).send();
    } catch (e: any) {
      if (e?.code === "VALIDATION") {
        return err(res, 400, "VALIDATION", e.message ?? "Invalid request");
      }
      console.error("[calendar] DELETE /calendar/:id error", e);
      return err(res, 500, "INTERNAL", "Unexpected error");
    }
  }
);
