import { Request, Response, NextFunction } from "express";

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

// TEMP auth stub for Week 1 testing via header
export function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  const role = (req.header("x-user-role") as Role) ?? "STUDENT";
  req.user = { id: "demo-user", role, email: "demo@forge.ac.za" };
  next();
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!allowed.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
