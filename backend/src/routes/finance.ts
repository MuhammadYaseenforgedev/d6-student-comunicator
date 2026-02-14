import { Router } from "express";
import { pool } from "../config/db";
import { pgFinanceRepo } from "../repos/pgFinanceRepo";

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

async function canParentViewStudent(parentId: string, studentId: string): Promise<boolean> {
  const q = `
    SELECT 1
    FROM parent_links
    WHERE parent_user_id = $1 AND student_user_id = $2
    LIMIT 1
  `;
  const res = await pool.query(q, [parentId, studentId]);
  return res.rowCount === 1;
}

export const financeRouter = Router();

// requireAuth is already applied globally in app.ts

// GET /finance/summary?userId=&studentId=
financeRouter.get("/finance/summary", async (req, res) => {
  try {
    const user = req.user as any;
    const role = String(user.role ?? "").toUpperCase();
    const me = String(user.id);

    let targetUserId = me;

    // Admin can view anyone
    if (role === "ADMIN" && req.query.userId) {
      targetUserId = String(req.query.userId);
    }

    // Parent can view linked student
    if (role === "PARENT" && req.query.studentId) {
      const sid = String(req.query.studentId);
      const ok = await canParentViewStudent(me, sid);
      if (!ok) return err(res, 403, "FORBIDDEN", "Not linked to this student");
      targetUserId = sid;
    }

    const summary = await pgFinanceRepo.getSummary(targetUserId);
    return res.json(summary);
  } catch {
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// GET /finance/transactions?limit=&userId=&studentId=
financeRouter.get("/finance/transactions", async (req, res) => {
  try {
    const user = req.user as any;
    const role = String(user.role ?? "").toUpperCase();
    const me = String(user.id);

    let targetUserId = me;

    if (role === "ADMIN" && req.query.userId) {
      targetUserId = String(req.query.userId);
    }

    if (role === "PARENT" && req.query.studentId) {
      const sid = String(req.query.studentId);
      const ok = await canParentViewStudent(me, sid);
      if (!ok) return err(res, 403, "FORBIDDEN", "Not linked to this student");
      targetUserId = sid;
    }

    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const tx = await pgFinanceRepo.listTransactions(targetUserId, { limit });
    return res.json({ value: tx, count: tx.length });
  } catch {
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});
