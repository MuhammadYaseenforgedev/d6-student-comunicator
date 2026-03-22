import type { Request, Response, NextFunction } from "express";
import { requireAuth, type AuthUser, type Role } from "./auth";
import { hasAdminScope, type AdminScope } from "../lib/adminAccess";

/**
 * Role guard.
 * Uses requireAuth (JWT) first, then checks req.user.role.
 *
 * Usage:
 *   router.post("/x", requireRole("ADMIN"), handler)
 */
export function requireRole(...allowed: Role[]) {
  return requireAccess({ roles: allowed });
}

export function requireAccess(input: {
  roles?: Role[];
  adminScopes?: readonly AdminScope[];
}) {
  // First run JWT auth, then check role
  const auth = requireAuth;
  const allowedRoles = [...(input.roles ?? [])];
  const allowedAdminScopes = [...(input.adminScopes ?? [])];

  return (req: Request, res: Response, next: NextFunction) => {
    auth(req, res, (err?: any) => {
      if (err) return next(err);

      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (req.user.role === "ADMIN" && allowedAdminScopes.length > 0) {
        if (!hasAdminScope(req.user, allowedAdminScopes)) {
          return res.status(403).json({ error: "Forbidden" });
        }
        return next();
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      next();
    });
  };
}

/**
 * OPTIONAL dev-only helper:
 * If you STILL need header-based auth for quick manual testing,
 * you can enable this middleware only in development.
 *
 * NOTE: Do NOT use this in production or when JWT is ready.
 */
export function devHeaderAuth(req: Request, _res: Response, next: NextFunction) {
  if (process.env.NODE_ENV !== "development") return next();

  const role = req.header("x-user-role") as Role | null;
  const id = req.header("x-user-id");
  const email = req.header("x-user-email");

  // Only set req.user if headers are explicitly provided
  if (role && id && email) {
    req.user = { id, role, email };
  }

  next();
}
