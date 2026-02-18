// src/routes/finance.ts
import { Router, type Request, type Response } from "express";
import { pool } from "../config/db";
import { pgFinanceRepo } from "../repos/pgFinanceRepo";

type AuthedRequest = Request & {
  user?: { id: string; role: string };
};

function err(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
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
      if (req.query.userId) targetUserId = String(req.query.userId);
    } else if (role === "PARENT") {
      const sid = String(req.query.studentId ?? "").trim();
      if (!sid) return err(res, 400, "VALIDATION", "studentId is required for parent finance view");

      const ok = await canParentViewStudent(me, sid);
      if (!ok) return err(res, 403, "FORBIDDEN", "Not linked to this student");

      targetUserId = sid;
    } else {
      // STUDENT / LECTURER: only allow own finance
      targetUserId = me;
    }

    const summary = await pgFinanceRepo.getSummary(targetUserId);
    return res.json(summary);
  } catch {
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
      if (req.query.userId) targetUserId = String(req.query.userId);
    } else if (role === "PARENT") {
      const sid = String(req.query.studentId ?? "").trim();
      if (!sid) return err(res, 400, "VALIDATION", "studentId is required for parent finance view");

      const ok = await canParentViewStudent(me, sid);
      if (!ok) return err(res, 403, "FORBIDDEN", "Not linked to this student");

      targetUserId = sid;
    } else {
      targetUserId = me;
    }

    const limitRaw = req.query.limit ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(limitRaw as number) ? (limitRaw as number) : undefined;

    const tx = await pgFinanceRepo.listTransactions(targetUserId, { limit });
    return res.json({ value: tx, count: tx.length });
  } catch {
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});
