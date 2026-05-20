import { Router } from "express";
import jwt from "jsonwebtoken";
import { getEffectiveAdminScope, type AdminScope } from "../lib/adminAccess";
import { pool } from "../config/db";
import { isLecturerAssignedToCourse } from "../lib/courseAccess";
import { buildIcsCalendar } from "../lib/ics";
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

function parseFeedRole(raw: unknown): "ADMIN" | "LECTURER" | "STUDENT" | "PARENT" | null {
  const role = String(raw ?? "").trim().toUpperCase();
  if (role === "ADMIN" || role === "LECTURER" || role === "STUDENT" || role === "PARENT") {
    return role;
  }
  return null;
}

export const calendarFeedRouter = Router();
export const calendarRouter = Router();

// requireAuth is already applied globally in app.ts

type CalendarFeedTokenPayload = {
  purpose: "calendar-feed";
  userId: string;
  role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";
  adminScope?: AdminScope | null;
  childId?: string | null;
};

function getJwtSecret(): string {
  const secret = String(process.env.JWT_SECRET ?? "").trim();
  if (!secret) throw Object.assign(new Error("JWT_SECRET not configured"), { code: "CONFIG" });
  return secret;
}

function feedUrlForRequest(req: any, token: string): string {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol || "http";
  const host = req.get("host") ?? "localhost";
  return `${protocol}://${host}/api/calendar/ics/${encodeURIComponent(token)}`;
}

function verifyCalendarFeedToken(raw: string): CalendarFeedTokenPayload | null {
  const token = String(raw ?? "").trim();
  if (!token) return null;

  try {
    const payload = jwt.verify(token, getJwtSecret(), {
      issuer: "forge-communicator",
      audience: "calendar-feed",
    });
    if (typeof payload !== "object" || payload === null) return null;

    const decoded = payload as Partial<CalendarFeedTokenPayload>;
    const role = parseFeedRole(decoded.role);
    const userId = String(decoded.userId ?? "").trim();
    const childId = String(decoded.childId ?? "").trim();

    if (decoded.purpose !== "calendar-feed") return null;
    if (!role) return null;
    if (!isUuid(userId)) return null;
    if (role === "PARENT" && (!childId || !isUuid(childId))) return null;
    if (role !== "PARENT" && childId) return null;

    return {
      purpose: "calendar-feed",
      userId,
      role,
      adminScope: getEffectiveAdminScope({ role, adminScope: decoded.adminScope }),
      childId: childId || null,
    };
  } catch {
    return null;
  }
}

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

// POST /calendar/feed-token
calendarRouter.post(
  "/calendar/feed-token",
  requireAccess({
    roles: ["LECTURER", "STUDENT", "PARENT"],
    adminScopes: ["ACADEMIC", "SUPER"],
  }),
  async (req, res) => {
    try {
      const user = req.user!;
      const childId = String(req.body?.childId ?? "").trim();

      if (user.role === "PARENT") {
        if (!childId) return err(res, 400, "VALIDATION", "childId is required for parent feeds");
        if (!isUuid(childId)) return err(res, 400, "VALIDATION", "childId must be a UUID");

        const ok = await parentHasChild(user.id, childId);
        if (!ok) return err(res, 403, "FORBIDDEN", "Parent is not linked to this child");
      } else if (childId) {
        return err(res, 400, "VALIDATION", "childId is only supported for parent feeds");
      }

      const payload: CalendarFeedTokenPayload = {
        purpose: "calendar-feed",
        userId: user.id,
        role: user.role,
        adminScope: getEffectiveAdminScope(user),
        childId: user.role === "PARENT" ? childId : null,
      };

      const token = jwt.sign(payload, getJwtSecret(), {
        expiresIn: "180d",
        issuer: "forge-communicator",
        audience: "calendar-feed",
      });

      return res.json({
        token,
        feedUrl: feedUrlForRequest(req, token),
        expiresInDays: 180,
      });
    } catch (e: any) {
      console.error("[calendar] POST /calendar/feed-token error", e);
      const status = e?.code === "CONFIG" ? 500 : 500;
      return err(res, status, "INTERNAL", "Failed to create calendar feed token");
    }
  }
);

// GET /calendar/ics/:token
calendarFeedRouter.get("/calendar/ics/:token", async (req, res) => {
  try {
    const payload = verifyCalendarFeedToken(String(req.params.token ?? ""));
    if (!payload) return err(res, 401, "UNAUTHORIZED", "Invalid or expired calendar feed token");

    if (payload.role === "ADMIN") {
      const scope = getEffectiveAdminScope(payload);
      if (scope !== "ACADEMIC" && scope !== "SUPER") {
        return err(res, 403, "FORBIDDEN", "Calendar feed is not available for this admin scope");
      }
    }

    let targetUserId = payload.userId;
    let targetRole = payload.role;

    if (payload.role === "PARENT") {
      const childId = String(payload.childId ?? "").trim();
      const ok = await parentHasChild(payload.userId, childId);
      if (!ok) return err(res, 403, "FORBIDDEN", "Parent is not linked to this child");
      targetUserId = childId;
      targetRole = "STUDENT";
    }

    const now = new Date();
    const starts = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ends = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const entries = await pgCalendarRepo.listForUser(targetUserId, {
      role: targetRole,
      start: starts,
      end: ends,
      limit: 250,
    });

    const ics = buildIcsCalendar(
      entries.map((entry) => ({
        id: entry.id,
        source: entry.source,
        title: entry.title,
        description: entry.description,
        location: entry.location,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
      }))
    );

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="forge-calendar.ics"');
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(ics);
  } catch (e: any) {
    console.error("[calendar] GET /calendar/ics/:token error", e);
    return err(res, 500, "INTERNAL", "Failed to load calendar feed");
  }
});

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
