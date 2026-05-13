import { Router } from "express";
import { pool } from "../config/db";
import { isAcademicOrSuperAdmin } from "../lib/adminAccess";
import { isStudentAllowedForModule } from "../lib/courseAccess";
import { createAnnouncementNotifications } from "../lib/notifications";
import { requireAccess } from "../middleware/rbac";
import { repos } from "../persistence";

export const announcementRouter = Router();
const DEFAULT_ANNOUNCEMENT_DURATION_DAYS = 30;
const MAX_ANNOUNCEMENT_DURATION_DAYS = 365;

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function cleanOptionalText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function addDaysToNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeDurationDays(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.trim())
        : NaN;

  if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
  return value;
}

function resolveAnnouncementExpiry(input: {
  expiresAt?: unknown;
  durationDays?: unknown;
  defaultDays?: number;
  allowDefault?: boolean;
}):
  | { ok: true; expiresAt: string }
  | { ok: false; status: number; code: string; message: string } {
  const expiresAtWasProvided = input.expiresAt !== undefined;
  const durationDaysWasProvided = input.durationDays !== undefined;
  const expiresAtText = typeof input.expiresAt === "string" ? input.expiresAt.trim() : "";
  if (expiresAtWasProvided && expiresAtText) {
    const parsed = Date.parse(expiresAtText);
    if (!Number.isFinite(parsed)) {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION",
        message: "expiresAt must be a valid ISO date/time",
      };
    }
    if (parsed <= Date.now()) {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION",
        message: "expiresAt must be in the future",
      };
    }
    return { ok: true, expiresAt: new Date(parsed).toISOString() };
  }

  if (durationDaysWasProvided) {
    const durationDays = normalizeDurationDays(input.durationDays);
    if (durationDays == null) {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION",
        message: "durationDays must be a whole number",
      };
    }
    if (durationDays <= 0 || durationDays > MAX_ANNOUNCEMENT_DURATION_DAYS) {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION",
        message: `durationDays must be between 1 and ${MAX_ANNOUNCEMENT_DURATION_DAYS}`,
      };
    }
    return { ok: true, expiresAt: addDaysToNow(durationDays) };
  }

  if (expiresAtWasProvided && !input.allowDefault) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION",
      message: "expiresAt must be a valid ISO date/time",
    };
  }

  if (!input.allowDefault) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION",
      message: "expiresAt or durationDays is required",
    };
  }

  return { ok: true, expiresAt: addDaysToNow(input.defaultDays ?? DEFAULT_ANNOUNCEMENT_DURATION_DAYS) };
}

type ChannelAccess = {
  exists: boolean;
  name: string;
  type: string;
  isPrivate: boolean;
  isMember: boolean;
};

async function getChannelAccess(channelId: string, userId: string): Promise<ChannelAccess> {
  const result = await pool.query<{
    name: string;
    type: string;
    isPrivate: boolean;
    isMember: boolean;
  }>(
    `
      SELECT
        c.name,
        c.type,
        c.is_private AS "isPrivate",
        EXISTS(
          SELECT 1
          FROM channel_members cm
          WHERE cm.channel_id = c.id
            AND cm.user_id = $2
        ) AS "isMember"
      FROM channels c
      WHERE c.id = $1
      LIMIT 1
    `,
    [channelId, userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    return {
      exists: false,
      name: "",
      type: "",
      isPrivate: false,
      isMember: false,
    };
  }

  return {
    exists: true,
    name: String(result.rows[0].name ?? "").trim(),
    type: String(result.rows[0].type ?? "").trim(),
    isPrivate: Boolean(result.rows[0].isPrivate),
    isMember: Boolean(result.rows[0].isMember),
  };
}

function canViewChannel(role: string, access: ChannelAccess): boolean {
  const normalizedRole = String(role ?? "").toUpperCase();
  if (normalizedRole === "ADMIN" || normalizedRole === "LECTURER") return true;
  if (!access.exists) return false;

  if (normalizedRole === "PARENT") return !access.isPrivate;
  return !access.isPrivate || access.isMember;
}

function isModulesChannel(access: ChannelAccess): boolean {
  return access.name.trim().toLowerCase() === "modules";
}

async function getAccessibleModuleIdsForUser(user: NonNullable<Express.Request["user"]>): Promise<string[] | null> {
  if (user.role === "ADMIN") {
    return isAcademicOrSuperAdmin(user) ? null : [];
  }

  if (user.role === "LECTURER") {
    const result = await pool.query<{ module_id: string }>(
      `
        SELECT module_id
        FROM lecturer_module_assignments
        WHERE lecturer_id = $1
      `,
      [user.id]
    );
    return result.rows.map((row) => row.module_id);
  }

  if (user.role === "STUDENT") {
    const result = await pool.query<{ id: string }>(
      `
        SELECT fm.id
        FROM faculty_modules fm
        JOIN student_module_enrollments sme
          ON sme.module_id = fm.id
         AND sme.student_id = $1
        JOIN student_courses sc
          ON sc.student_user_id = $1
         AND sc.course_id = fm.course_id
         AND sc.status = 'ACTIVE'
      `,
      [user.id]
    );
    return result.rows.map((row) => row.id);
  }

  if (user.role === "PARENT") {
    const result = await pool.query<{ id: string }>(
      `
        SELECT DISTINCT fm.id
        FROM parent_links pl
        JOIN student_module_enrollments sme
          ON sme.student_id = pl.student_user_id
        JOIN faculty_modules fm
          ON fm.id = sme.module_id
        JOIN student_courses sc
          ON sc.student_user_id = pl.student_user_id
         AND sc.course_id = fm.course_id
         AND sc.status = 'ACTIVE'
        WHERE pl.parent_user_id = $1
      `,
      [user.id]
    );
    return result.rows.map((row) => row.id);
  }

  return [];
}

async function ensureModuleExists(moduleId: string): Promise<{
  id: string;
  code: string;
  name: string;
} | null> {
  const result = await pool.query<{
    id: string;
    code: string;
    name: string;
  }>(
    `
      SELECT id, code, name
      FROM faculty_modules
      WHERE id = $1
      LIMIT 1
    `,
    [moduleId]
  );

  return result.rows[0] ?? null;
}

async function canAccessModuleForAnnouncements(
  user: NonNullable<Express.Request["user"]>,
  moduleId: string
): Promise<boolean> {
  if (user.role === "ADMIN") return isAcademicOrSuperAdmin(user);

  if (user.role === "LECTURER") {
    const result = await pool.query(
      `
        SELECT 1
        FROM lecturer_module_assignments
        WHERE lecturer_id = $1
          AND module_id = $2
        LIMIT 1
      `,
      [user.id, moduleId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  if (user.role === "STUDENT") {
    return isStudentAllowedForModule(pool, user.id, moduleId);
  }

  if (user.role === "PARENT") {
    const result = await pool.query(
      `
        SELECT 1
        FROM parent_links pl
        JOIN student_module_enrollments sme
          ON sme.student_id = pl.student_user_id
        JOIN faculty_modules fm
          ON fm.id = sme.module_id
        JOIN student_courses sc
          ON sc.student_user_id = pl.student_user_id
         AND sc.course_id = fm.course_id
         AND sc.status = 'ACTIVE'
        WHERE pl.parent_user_id = $1
          AND fm.id = $2
        LIMIT 1
      `,
      [user.id, moduleId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  return false;
}

async function filterAnnouncementsForChannel(
  user: NonNullable<Express.Request["user"]>,
  access: ChannelAccess,
  requestedModuleId: string | null,
  channelId: string,
  includeExpired = false
) {
  const list = await repos.announcements.listByChannel(channelId, { includeExpired });
  if (!isModulesChannel(access)) return list;

  if (requestedModuleId) {
    return list.filter(
      (announcement) =>
        !announcement.moduleId || String(announcement.moduleId) === requestedModuleId
    );
  }

  const accessibleModuleIds = await getAccessibleModuleIdsForUser(user);
  if (accessibleModuleIds == null) return list;

  const accessibleModuleSet = new Set(accessibleModuleIds);
  return list.filter(
    (announcement) =>
      !announcement.moduleId || accessibleModuleSet.has(String(announcement.moduleId))
  );
}

async function listAnnouncementsForChannel(req: any, res: any, channelId: string) {
  const user = req.user!;
  const access = await getChannelAccess(channelId, user.id);
  if (!access.exists) return err(res, 404, "NOT_FOUND", "Channel not found");
  if (!canViewChannel(user.role, access)) {
    return err(res, 403, "FORBIDDEN", "You do not have access to this channel");
  }

  const requestedModuleId = cleanOptionalText(req.query?.moduleId) ?? null;
  const includeExpiredRequested =
    String(req.query?.includeExpired ?? "").trim().toLowerCase() === "true";
  const includeExpired =
    includeExpiredRequested && (user.role === "ADMIN" || user.role === "LECTURER");
  if (requestedModuleId) {
    if (!isModulesChannel(access)) {
      return err(res, 400, "VALIDATION", "moduleId can only be used on the Modules channel");
    }
    if (!isUuid(requestedModuleId)) {
      return err(res, 400, "VALIDATION", "moduleId must be a UUID");
    }
    const moduleRow = await ensureModuleExists(requestedModuleId);
    if (!moduleRow) return err(res, 404, "NOT_FOUND", "Module not found");
    if (!(await canAccessModuleForAnnouncements(user, requestedModuleId))) {
      return err(res, 403, "FORBIDDEN", "You do not have access to this module");
    }
  }

  const list = await filterAnnouncementsForChannel(
    user,
    access,
    requestedModuleId,
    channelId,
    includeExpired
  );
  return res.json(list);
}

announcementRouter.get(
  "/announcements",
  requireAccess({
    roles: ["ADMIN", "LECTURER", "STUDENT", "PARENT"],
    adminScopes: ["ACADEMIC", "SUPER"],
  }),
  async (req, res) => {
    try {
      const channelId = String(req.query.channelId ?? "").trim();
      if (!channelId) {
        return err(res, 400, "VALIDATION", "channelId query parameter is required");
      }
      return await listAnnouncementsForChannel(req, res, channelId);
    } catch (e: any) {
      console.error("[announcements] GET alias error", e);
      return err(res, 500, "INTERNAL", "Failed to list announcements");
    }
  }
);

announcementRouter.get(
  "/channels/:channelId/announcements",
  requireAccess({
    roles: ["ADMIN", "LECTURER", "STUDENT", "PARENT"],
    adminScopes: ["ACADEMIC", "SUPER"],
  }),
  async (req, res) => {
    try {
      const { channelId } = req.params as { channelId: string };
      return await listAnnouncementsForChannel(req, res, channelId);
    } catch (e: any) {
      console.error("[announcements] GET error", e);
      return err(res, 500, "INTERNAL", "Failed to list announcements");
    }
  }
);

announcementRouter.post(
  "/channels/:channelId/announcements",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const { channelId } = req.params as { channelId: string };
      const { title, body, pinned, expiresAt, durationDays } = req.body as {
        title?: string;
        body?: string;
        pinned?: boolean;
        expiresAt?: string;
        durationDays?: number | string;
      };
      const rawModuleId = cleanOptionalText(req.body?.moduleId) ?? null;

      if (!title || !body) {
        return err(res, 400, "VALIDATION", "Missing title or body");
      }

      const access = await getChannelAccess(channelId, req.user!.id);
      if (!access.exists) return err(res, 404, "NOT_FOUND", "Channel not found");

      let moduleRow: { id: string; code: string; name: string } | null = null;
      if (isModulesChannel(access)) {
        if (!rawModuleId) {
          return err(
            res,
            400,
            "VALIDATION",
            "moduleId is required when posting to the Modules channel"
          );
        }
        if (!isUuid(rawModuleId)) {
          return err(res, 400, "VALIDATION", "moduleId must be a UUID");
        }
        moduleRow = await ensureModuleExists(rawModuleId);
        if (!moduleRow) return err(res, 404, "NOT_FOUND", "Module not found");
        if (!(await canAccessModuleForAnnouncements(req.user!, rawModuleId))) {
          return err(res, 403, "FORBIDDEN", "You do not have access to this module");
        }
      } else if (rawModuleId) {
        return err(res, 400, "VALIDATION", "moduleId can only be used on the Modules channel");
      }

      const expiry = resolveAnnouncementExpiry({
        expiresAt,
        durationDays,
        allowDefault: true,
      });
      if (!expiry.ok) {
        return err(res, expiry.status, expiry.code, expiry.message);
      }

      const created = await repos.announcements.create({
        channelId,
        moduleId: moduleRow?.id ?? null,
        title: title.trim(),
        body: body.trim(),
        pinned: Boolean(pinned),
        createdBy: req.user!.id,
        expiresAt: expiry.expiresAt,
      });

      await createAnnouncementNotifications({
        announcementId: created.id,
        channelId,
        actorId: req.user!.id,
        title: created.title,
        moduleId: moduleRow?.id ?? null,
        moduleLabel: moduleRow ? `${moduleRow.code} - ${moduleRow.name}` : null,
      }).catch((e) => {
        console.error("[announcements] notification fan-out failed", e);
      });

      return res.status(201).json({
        ...created,
        moduleCode: moduleRow?.code ?? created.moduleCode ?? null,
        moduleName: moduleRow?.name ?? created.moduleName ?? null,
      });
    } catch (e: any) {
      console.error("[announcements] POST error", e);
      return err(res, 500, "INTERNAL", "Failed to create announcement");
    }
  }
);

announcementRouter.patch(
  "/channels/:channelId/announcements/:announcementId",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const { channelId, announcementId } = req.params as {
        channelId: string;
        announcementId: string;
      };

      const titleRaw = cleanOptionalText(req.body?.title);
      const bodyRaw = cleanOptionalText(req.body?.body);
      const pinnedRaw = req.body?.pinned;
      const expiresAtProvided =
        Object.prototype.hasOwnProperty.call(req.body ?? {}, "expiresAt") ||
        Object.prototype.hasOwnProperty.call(req.body ?? {}, "durationDays");

      const hasTitle = typeof titleRaw === "string";
      const hasBody = typeof bodyRaw === "string";
      const hasPinned = typeof pinnedRaw === "boolean";
      let nextExpiresAt: string | undefined;

      if (!hasTitle && !hasBody && !hasPinned && !expiresAtProvided) {
        return err(
          res,
          400,
          "VALIDATION",
          "Provide at least one of: title, body, pinned, expiresAt"
        );
      }

      if (titleRaw === "") return err(res, 400, "VALIDATION", "title cannot be empty");
      if (bodyRaw === "") return err(res, 400, "VALIDATION", "body cannot be empty");
      if (expiresAtProvided) {
        const expiry = resolveAnnouncementExpiry({
          expiresAt: req.body?.expiresAt,
          durationDays: req.body?.durationDays,
          allowDefault: false,
        });
        if (!expiry.ok) {
          return err(res, expiry.status, expiry.code, expiry.message);
        }
        nextExpiresAt = expiry.expiresAt;
      }

      const updated = await repos.announcements.update({
        id: announcementId,
        channelId,
        title: hasTitle ? titleRaw : undefined,
        body: hasBody ? bodyRaw : undefined,
        pinned: hasPinned ? Boolean(pinnedRaw) : undefined,
        expiresAt: nextExpiresAt,
      });

      if (!updated) return err(res, 404, "NOT_FOUND", "Announcement not found");

      return res.json(updated);
    } catch (e: any) {
      console.error("[announcements] PATCH error", e);
      return err(res, 500, "INTERNAL", "Failed to update announcement");
    }
  }
);

announcementRouter.delete(
  "/channels/:channelId/announcements/:announcementId",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const { channelId, announcementId } = req.params as {
        channelId: string;
        announcementId: string;
      };

      const ok = await repos.announcements.delete(announcementId, channelId);
      if (!ok) return err(res, 404, "NOT_FOUND", "Announcement not found");

      await pool.query(
        `
          DELETE FROM user_notifications
          WHERE source_key = $1
        `,
        [`announcement:${announcementId}`]
      );

      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[announcements] DELETE error", e);
      return err(res, 500, "INTERNAL", "Failed to delete announcement");
    }
  }
);
