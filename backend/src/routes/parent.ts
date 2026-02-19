import { Router } from "express";
import { pool } from "../config/db";
import { requireRole } from "../middleware/rbac";

export const parentRouter = Router();

// requireAuth is already applied globally in app.ts
parentRouter.use(requireRole("PARENT"));

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function parentCanLinkChildren(parentId: string): Promise<boolean> {
  const q = `
    SELECT can_link_children
    FROM users
    WHERE id = $1
    LIMIT 1
  `;
  const r = await pool.query<{ can_link_children: boolean }>(q, [parentId]);
  return (r.rowCount ?? 0) > 0 ? Boolean(r.rows[0].can_link_children) : false;
}

// GET /parent/children
parentRouter.get("/children", async (req, res) => {
  try {
    const parentId = req.user!.id;

    const q = `
      SELECT
        u.id,
        u.email,
        u.public_student_id
      FROM parent_links pl
      JOIN users u ON u.id = pl.student_user_id
      WHERE pl.parent_user_id = $1
      ORDER BY lower(u.email) ASC
    `;
    const r = await pool.query<{ id: string; email: string; public_student_id: string | null }>(q, [parentId]);

    const children = r.rows.map((x) => ({
      id: x.id,
      email: x.email,
      role: "STUDENT" as const,
      publicStudentId: x.public_student_id,
    }));

    return res.json({ value: children, count: children.length });
  } catch (e: any) {
    console.error("[parent] GET /parent/children error", e);
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// POST /parent/children { studentPublicId }  (preferred)
// POST /parent/children { studentEmail }     (legacy fallback)
parentRouter.post("/children", async (req, res) => {
  try {
    const parentId = req.user!.id;

    const allowed = await parentCanLinkChildren(parentId);
    if (!allowed) {
      return err(res, 403, "FORBIDDEN", "Parent is not allowed to link children yet (await admin approval)");
    }

    const studentPublicId = String(req.body?.studentPublicId ?? "").trim();
    const studentEmail = String(req.body?.studentEmail ?? "").trim().toLowerCase();

    if (!studentPublicId && !studentEmail) {
      return err(res, 400, "VALIDATION", "Provide studentPublicId (preferred) or studentEmail (legacy)");
    }

    const findQ = studentPublicId
      ? `
        SELECT id, email, public_student_id
        FROM users
        WHERE role = 'STUDENT'
          AND public_student_id = $1
        LIMIT 1
      `
      : `
        SELECT id, email, public_student_id
        FROM users
        WHERE role = 'STUDENT'
          AND lower(email) = lower($1)
        LIMIT 1
      `;

    const findArg = studentPublicId ? studentPublicId : studentEmail;

    const studentRes = await pool.query<{
      id: string;
      email: string;
      public_student_id: string | null;
    }>(findQ, [findArg]);

    if ((studentRes.rowCount ?? 0) === 0) {
      return err(res, 404, "NOT_FOUND", "Student not found");
    }

    const student = studentRes.rows[0];

    const linkQ = `
      INSERT INTO parent_links (parent_user_id, student_user_id)
      VALUES ($1, $2)
      ON CONFLICT (parent_user_id, student_user_id) DO NOTHING
      RETURNING 1 AS inserted
    `;
    const linkRes = await pool.query<{ inserted: number }>(linkQ, [parentId, student.id]);

    const created = (linkRes.rowCount ?? 0) > 0;

    return res.status(created ? 201 : 200).json({
      created,
      child: {
        id: student.id,
        email: student.email,
        role: "STUDENT" as const,
        publicStudentId: student.public_student_id,
      },
    });
  } catch (e: any) {
    console.error("[parent] POST /parent/children error", e);
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// DELETE /parent/children/:studentId
parentRouter.delete("/children/:studentId", async (req, res) => {
  try {
    const parentId = req.user!.id;
    const studentId = String(req.params.studentId ?? "").trim();

    if (!studentId || !isUuid(studentId)) {
      return err(res, 400, "VALIDATION", "studentId must be a UUID");
    }

    const q = `
      DELETE FROM parent_links
      WHERE parent_user_id = $1
        AND student_user_id = $2
    `;
    const r = await pool.query(q, [parentId, studentId]);

    if ((r.rowCount ?? 0) === 0) {
      return err(res, 404, "NOT_FOUND", "Link not found");
    }

    return res.status(204).send();
  } catch (e: any) {
    console.error("[parent] DELETE /parent/children/:studentId error", e);
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});
