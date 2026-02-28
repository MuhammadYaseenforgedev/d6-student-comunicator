import { Router, type Request, type Response } from "express";
import { pool } from "../config/db";
import { pgFinanceRepo } from "../repos/pgFinanceRepo";

type AuthedRequest = Request & {
  user?: { id: string; role: string };
};

function err(res: Response, status: number, code: string, message: string) {
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

async function canParentViewStudent(parentId: string, studentId: string): Promise<boolean> {
  const q = `
    SELECT 1
    FROM parent_links
    WHERE parent_user_id = $1 AND student_user_id = $2
    LIMIT 1
  `;
  const r = await pool.query(q, [parentId, studentId]);
  return (r.rowCount ?? 0) > 0;
}

export const financeRouter = Router();

// requireAuth is already applied globally in app.ts

// GET /finance/summary?userId=&studentId=
financeRouter.get("/finance/summary", async (req: AuthedRequest, res: Response) => {
  try {
    const user = req.user;
    const role = String(user?.role ?? "").toUpperCase();
    const me = String(user?.id ?? "");

    if (!me) return err(res, 401, "UNAUTHORIZED", "Missing user");

    let targetUserId = me;

    if (role === "ADMIN") {
      if (req.query.userId) {
        const uid = String(req.query.userId).trim();
        if (!isUuid(uid)) return err(res, 400, "VALIDATION", "userId must be a UUID");
        targetUserId = uid;
      }
    } else if (role === "PARENT") {
      const sid = String(req.query.studentId ?? "").trim();
      if (!sid) return err(res, 400, "VALIDATION", "studentId is required for parent finance view");
      if (!isUuid(sid)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

      const ok = await canParentViewStudent(me, sid);
      if (!ok) return err(res, 403, "FORBIDDEN", "Not linked to this student");

      targetUserId = sid;
    } else {
      // STUDENT / LECTURER: only allow own finance
      targetUserId = me;
    }

    const summary = await pgFinanceRepo.getSummary(targetUserId);
    return res.json(summary);
  } catch (e: any) {
    console.error("[finance] GET /finance/summary error", e);
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// GET /finance/transactions?limit=&userId=&studentId=
financeRouter.get("/finance/transactions", async (req: AuthedRequest, res: Response) => {
  try {
    const user = req.user;
    const role = String(user?.role ?? "").toUpperCase();
    const me = String(user?.id ?? "");

    if (!me) return err(res, 401, "UNAUTHORIZED", "Missing user");

    let targetUserId = me;

    if (role === "ADMIN") {
      if (req.query.userId) {
        const uid = String(req.query.userId).trim();
        if (!isUuid(uid)) return err(res, 400, "VALIDATION", "userId must be a UUID");
        targetUserId = uid;
      }
    } else if (role === "PARENT") {
      const sid = String(req.query.studentId ?? "").trim();
      if (!sid) return err(res, 400, "VALIDATION", "studentId is required for parent finance view");
      if (!isUuid(sid)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

      const ok = await canParentViewStudent(me, sid);
      if (!ok) return err(res, 403, "FORBIDDEN", "Not linked to this student");

      targetUserId = sid;
    } else {
      targetUserId = me;
    }

    const limit = parseLimit(req.query.limit, 50);

    const tx = await pgFinanceRepo.listTransactions(targetUserId, { limit });
    return res.json({ value: tx, count: tx.length });
  } catch (e: any) {
    console.error("[finance] GET /finance/transactions error", e);
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});
