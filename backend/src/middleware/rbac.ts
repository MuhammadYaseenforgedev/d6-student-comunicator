import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "./auth";

export type Role = "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";

export type AuthUser = {
  id: string;
  role: Role;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Role guard.
 * Uses requireAuth (JWT) first, then checks req.user.role.
 *
 * Usage:
 *   router.post("/x", requireRole("ADMIN"), handler)
 */
export function requireRole(...allowed: Role[]) {
  // First run JWT auth, then check role
  const auth = requireAuth;

  return (req: Request, res: Response, next: NextFunction) => {
    auth(req, res, (err?: any) => {
      if (err) return next(err);

      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!allowed.includes(req.user.role)) {
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
