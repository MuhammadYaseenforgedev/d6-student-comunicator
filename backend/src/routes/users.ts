import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "../config/db";

type Role = "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";

type UserDirectoryRow = {
  id: string;
  email: string;
  role: Role;
};

const VALID_ROLES: Role[] = ["ADMIN", "LECTURER", "STUDENT", "PARENT"];
const PARENT_ALLOWED_TARGETS: Role[] = ["ADMIN", "LECTURER"];

function err(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function parseLimit(raw: unknown, fallback = 50) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

function toRole(v: unknown): Role | null {
  const role = String(v ?? "").trim().toUpperCase();
  return VALID_ROLES.includes(role as Role) ? (role as Role) : null;
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
userRouter.get("/", async (req: Request, res: Response) => {
  try {
    const requesterRole = toRole(req.user?.role);
    if (!requesterRole) return err(res, 403, "FORBIDDEN", "Invalid role");

    if (requesterRole !== "ADMIN" && requesterRole !== "LECTURER" && requesterRole !== "PARENT") {
      return err(res, 403, "FORBIDDEN", "Role cannot access user directory");
    }

    const limit = parseLimit(req.query.limit, 50);
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
