import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type Role = "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
};

// This makes req.user available everywhere in TS
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const VALID_ROLES: Role[] = ["ADMIN", "LECTURER", "STUDENT", "PARENT"];

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  // Expect: "Bearer <token>" (case-insensitive for safety)
  const [type, token] = header.split(" ");
  if (!type || !token) return null;

  if (type.toLowerCase() !== "bearer") return null;
  return token;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing Bearer token" });

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: "JWT_SECRET not configured" });

  try {
    const payload = jwt.verify(token, secret);

    if (typeof payload !== "object" || payload === null) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    const { id, email, role } = payload as Partial<AuthUser>;

    if (!id || !email || !role) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    if (!VALID_ROLES.includes(role as Role)) {
      return res.status(401).json({ error: "Invalid token role" });
    }

    req.user = { id, email, role: role as Role };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
