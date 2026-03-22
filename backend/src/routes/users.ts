import bcrypt from "bcryptjs";
import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "../config/db";
import { requireAccess } from "../middleware/rbac";
import { validatePassword } from "../lib/passwordPolicy";
import { getEffectiveAdminScope, normalizeAdminScope, type AdminScope } from "../lib/adminAccess";

type Role = "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";

type UserDirectoryRow = {
  id: string;
  email: string;
  role: Role;
};

type AdminAccountRow = {
  id: string;
  email: string;
  role: Role;
  admin_scope: AdminScope | null;
  first_name: string | null;
  last_name: string | null;
  course_name: string | null;
  public_student_id: string | null;
  can_link_children: boolean;
  created_at: string;
};

const VALID_ROLES: Role[] = ["ADMIN", "LECTURER", "STUDENT", "PARENT"];
const PARENT_ALLOWED_TARGETS: Role[] = ["ADMIN", "LECTURER"];

function err(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function parseLimit(raw: unknown, fallback = 50, max = 100) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function toRole(v: unknown): Role | null {
  const role = String(v ?? "").trim().toUpperCase();
  return VALID_ROLES.includes(role as Role) ? (role as Role) : null;
}

function normalizeStudentNumber(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function parseRoleFilters(rawRole: unknown, rawRoles: unknown): Role[] {
  const values: string[] = [];

  const addRaw = (input: unknown) => {
    if (Array.isArray(input)) {
      for (const v of input) addRaw(v);
      return;
    }
    const text = String(input ?? "").trim();
    if (!text) return;
    for (const piece of text.split(",")) {
      const part = piece.trim();
      if (part) values.push(part);
    }
  };

  addRaw(rawRole);
  addRaw(rawRoles);

  const out: Role[] = [];
  for (const value of values) {
    const role = toRole(value);
    if (!role) continue;
    if (!out.includes(role)) out.push(role);
  }
  return out;
}

export const userRouter = Router();

// requireAuth is applied globally in app.ts
userRouter.get(
  "/admin/accounts",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req: Request, res: Response) => {
    try {
      const limit = parseLimit(req.query.limit, 200, 500);
      const q = String(req.query.q ?? "").trim().toLowerCase();
      const requestedRoles = parseRoleFilters(req.query.role, req.query.roles);
      const roleFilter = requestedRoles.length > 0 ? requestedRoles : [...VALID_ROLES];

      const params: unknown[] = [];
      const where: string[] = [];

      params.push(roleFilter);
      where.push(`u.role = ANY($${params.length}::text[])`);

      if (q) {
        params.push(`%${q}%`);
        where.push(`(
        lower(u.email) LIKE $${params.length}
        OR lower(COALESCE(u.first_name, '')) LIKE $${params.length}
        OR lower(COALESCE(u.last_name, '')) LIKE $${params.length}
        OR lower(COALESCE(u.course_name, '')) LIKE $${params.length}
        OR lower(COALESCE(u.public_student_id, '')) LIKE $${params.length}
      )`);
      }

      params.push(limit);

      const sql = `
      SELECT
        u.id,
        u.email,
        u.role,
        u.admin_scope,
        u.first_name,
        u.last_name,
        u.course_name,
        u.public_student_id,
        u.can_link_children,
        u.created_at
      FROM users u
      WHERE ${where.join(" AND ")}
      ORDER BY
        CASE u.role
          WHEN 'ADMIN' THEN 1
          WHEN 'LECTURER' THEN 2
          WHEN 'STUDENT' THEN 3
          WHEN 'PARENT' THEN 4
          ELSE 5
        END,
        lower(u.email) ASC
      LIMIT $${params.length}
    `;

      const rows = await pool.query<AdminAccountRow>(sql, params);
      return res.json({
        value: rows.rows.map((row) => ({
          id: row.id,
          email: row.email,
          role: row.role,
          adminScope: getEffectiveAdminScope({ role: row.role, adminScope: row.admin_scope }),
          firstName: row.first_name,
          lastName: row.last_name,
          courseName: row.course_name,
          studentNumber: row.public_student_id,
          canLinkChildren: row.can_link_children,
          createdAt: row.created_at,
        })),
        count: rows.rows.length,
      });
    } catch (e: unknown) {
      console.error("[users] GET /users/admin/accounts error", e);
      return err(res, 500, "INTERNAL", "Failed to list admin accounts");
    }
  }
);

userRouter.delete(
  "/admin/accounts/:id",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req: Request, res: Response) => {
    try {
      const requesterId = String(req.user?.id ?? "").trim();
      const targetId = String(req.params.id ?? "").trim();

      if (!isUuid(targetId)) {
        return err(res, 400, "VALIDATION", "id must be a UUID");
      }

      if (targetId === requesterId) {
        return err(res, 400, "VALIDATION", "Admin cannot delete the current account");
      }

      const target = await pool.query<UserDirectoryRow>(
        `
        SELECT id, email, role
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
        [targetId]
      );

      if ((target.rowCount ?? 0) === 0) {
        return err(res, 404, "NOT_FOUND", "User not found");
      }

      if (target.rows[0].role === "ADMIN") {
        const remainingAdmins = await pool.query<{ count: string }>(
          `
          SELECT COUNT(*)::text AS count
          FROM users
          WHERE role = 'ADMIN'
            AND id <> $1
        `,
          [targetId]
        );
        if (Number(remainingAdmins.rows[0]?.count ?? "0") === 0) {
          return err(res, 400, "VALIDATION", "Cannot delete the last admin account");
        }
      }

      const authoredAnnouncementIds = await pool.query<{ id: string }>(
        `
          SELECT id
          FROM announcements
          WHERE created_by = $1
        `,
        [targetId]
      );

      const deleted = await pool.query<UserDirectoryRow>(
        `
        DELETE FROM users
        WHERE id = $1
        RETURNING id, email, role
      `,
        [targetId]
      );

      const announcementSourceKeys = authoredAnnouncementIds.rows.map((row) => `announcement:${row.id}`);
      if (announcementSourceKeys.length > 0) {
        await pool.query(
          `
            DELETE FROM user_notifications
            WHERE source_key = ANY($1::text[])
          `,
          [announcementSourceKeys]
        );
      }

      return res.json({ ok: true, user: deleted.rows[0] });
    } catch (e: unknown) {
      console.error("[users] DELETE /users/admin/accounts/:id error", e);
      return err(res, 500, "INTERNAL", "Failed to delete account");
    }
  }
);

userRouter.patch(
  "/admin/accounts/:id",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req: Request, res: Response) => {
    try {
      const targetId = String(req.params.id ?? "").trim();
      if (!isUuid(targetId)) {
        return err(res, 400, "VALIDATION", "id must be a UUID");
      }

      const hasPassword = Object.prototype.hasOwnProperty.call(req.body ?? {}, "password");
      const hasStudentNumber = Object.prototype.hasOwnProperty.call(req.body ?? {}, "studentNumber");
      const hasAdminScope = Object.prototype.hasOwnProperty.call(req.body ?? {}, "adminScope");
      if (!hasPassword && !hasStudentNumber && !hasAdminScope) {
        return err(res, 400, "VALIDATION", "At least one editable field is required");
      }

      const target = await pool.query<AdminAccountRow>(
        `
        SELECT
          id,
          email,
          role,
          admin_scope,
          first_name,
          last_name,
          course_name,
          public_student_id,
          can_link_children,
          created_at
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
        [targetId]
      );

      if ((target.rowCount ?? 0) === 0) {
        return err(res, 404, "NOT_FOUND", "User not found");
      }

      const updates: string[] = [];
      const params: unknown[] = [];

      if (hasPassword) {
        const nextPassword = String(req.body?.password ?? "");
        const passwordError = validatePassword(nextPassword);
        if (passwordError) {
          return err(res, 400, "VALIDATION", passwordError);
        }
        const passwordHash = await bcrypt.hash(nextPassword, 10);
        params.push(passwordHash);
        updates.push(`password_hash = $${params.length}`);
      }

      if (hasStudentNumber) {
        if (target.rows[0].role !== "STUDENT") {
          return err(res, 400, "VALIDATION", "studentNumber can only be edited for student accounts");
        }
        const studentNumber = normalizeStudentNumber(req.body?.studentNumber);
        if (!studentNumber) {
          return err(res, 400, "VALIDATION", "studentNumber is required for student accounts");
        }
        if (studentNumber.length > 64) {
          return err(res, 400, "VALIDATION", "studentNumber must be 64 characters or fewer");
        }
        params.push(studentNumber);
        updates.push(`public_student_id = $${params.length}`);
      }

      if (hasAdminScope) {
        if (target.rows[0].role !== "ADMIN") {
          return err(res, 400, "VALIDATION", "adminScope can only be edited for admin accounts");
        }
        const adminScope = normalizeAdminScope(req.body?.adminScope);
        if (!adminScope) {
          return err(res, 400, "VALIDATION", "adminScope is invalid");
        }
        params.push(adminScope);
        updates.push(`admin_scope = $${params.length}`);
      }

      params.push(targetId);

      const updated = await pool.query<AdminAccountRow>(
        `
        UPDATE users
        SET ${updates.join(", ")}
        WHERE id = $${params.length}
        RETURNING
          id,
          email,
          role,
          admin_scope,
          first_name,
          last_name,
          course_name,
          public_student_id,
          can_link_children,
          created_at
      `,
        params
      );

      const row = updated.rows[0];
      return res.json({
        ok: true,
        user: {
          id: row.id,
          email: row.email,
          role: row.role,
          adminScope: getEffectiveAdminScope({ role: row.role, adminScope: row.admin_scope }),
          firstName: row.first_name,
          lastName: row.last_name,
          courseName: row.course_name,
          studentNumber: row.public_student_id,
          canLinkChildren: row.can_link_children,
          createdAt: row.created_at,
        },
      });
    } catch (e: any) {
      if (String(e?.code ?? "") === "23505") {
        return err(res, 400, "VALIDATION", "Student number already exists");
      }
      console.error("[users] PATCH /users/admin/accounts/:id error", e);
      return err(res, 500, "INTERNAL", "Failed to update account");
    }
  }
);

userRouter.get("/", async (req: Request, res: Response) => {
  try {
    const requesterRole = toRole(req.user?.role);
    if (!requesterRole) return err(res, 403, "FORBIDDEN", "Invalid role");

    if (requesterRole !== "ADMIN" && requesterRole !== "LECTURER" && requesterRole !== "PARENT") {
      return err(res, 403, "FORBIDDEN", "Role cannot access user directory");
    }

    const limit = parseLimit(req.query.limit, 50, 500);
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const requestedRoles = parseRoleFilters(req.query.role, req.query.roles);

    let roleFilter = requestedRoles.length > 0 ? requestedRoles : [...VALID_ROLES];
    if (requesterRole === "PARENT") {
      roleFilter = roleFilter.filter((r) => PARENT_ALLOWED_TARGETS.includes(r));
      if (roleFilter.length === 0) {
        return err(res, 403, "FORBIDDEN", "Parents may only list ADMIN or LECTURER recipients");
      }
    }

    const params: unknown[] = [];
    const where: string[] = [];

    params.push(roleFilter);
    where.push(`role = ANY($${params.length}::text[])`);

    if (q) {
      params.push(`%${q}%`);
      where.push(`lower(email) LIKE $${params.length}`);
    }

    params.push(limit);

    const sql = `
      SELECT id, email, role
      FROM users
      WHERE ${where.join(" AND ")}
      ORDER BY lower(email) ASC
      LIMIT $${params.length}
    `;

    const rows = await pool.query<UserDirectoryRow>(sql, params);
    return res.json({ value: rows.rows, count: rows.rows.length });
  } catch (e: unknown) {
    console.error("[users] GET /users error", e);
    return err(res, 500, "INTERNAL", "Failed to list users");
  }
});
