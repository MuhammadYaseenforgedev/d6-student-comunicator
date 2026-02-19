import { Router } from "express";
import crypto from "crypto";
import { pool } from "../config/db";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";

export const parentRouter = Router();

// requireAuth is already applied globally in app.ts

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function newId() {
  return crypto.randomUUID();
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Resolves a student by either:
 * - public_student_id (preferred, matches frontend placeholder like STU-1001)
 * - email (fallback)
 *
 * Returns the student's user id or null.
 */
async function resolveStudentUserId(childIdOrEmail: string): Promise<string | null> {
  const q = `
    SELECT id
    FROM users
    WHERE role = 'STUDENT'
      AND (public_student_id = $1 OR lower(email) = lower($1))
    LIMIT 1
  `;
  const r = await pool.query<{ id: string }>(q, [childIdOrEmail]);
  return r.rows[0]?.id ?? null;
}

async function parentHasApprovedLink(parentId: string, studentId: string): Promise<boolean> {
  const q = `
    SELECT 1
    FROM parent_links
    WHERE parent_user_id = $1 AND student_user_id = $2
    LIMIT 1
  `;
  const r = await pool.query(q, [parentId, studentId]);
  return (r.rowCount ?? 0) > 0;
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

/**
 * GET /api/parent
 * Basic parent portal check endpoint (frontend uses this)
 */
parentRouter.get("/parent", requireRole("PARENT"), async (req, res) => {
  return res.json({
    ok: true,
    role: req.user!.role,
    message: "Parent portal access OK",
  });
});

/**
 * -------------------------
 * LINK REQUEST FLOW (Option A)
 * -------------------------
 *
 * PARENT creates a link request using a student-id like STU-1001 (email allowed as fallback).
 * ADMIN approves/rejects.
 */

/**
 * POST /api/parent/link-requests
 * Body: { childId: "STU-1001" }  (preferred) OR { childId: "student@email.com" }
 */
parentRouter.post("/parent/link-requests", requireRole("PARENT"), async (req, res) => {
  try {
    const parentId = req.user!.id;
    const childId = String(req.body?.childId ?? "").trim();

    if (!childId) return err(res, 400, "VALIDATION", "childId is required (e.g. STU-1001)");

    const studentId = await resolveStudentUserId(childId);
    if (!studentId) return err(res, 404, "NOT_FOUND", "Student not found");

    // Already approved link?
    if (await parentHasApprovedLink(parentId, studentId)) {
      return res.status(200).json({
        id: "already-linked",
        childId,
        status: "APPROVED",
        requestedAt: new Date().toISOString(),
      });
    }

    const id = newId();

    // Create pending request (ignore duplicates safely)
    await pool.query(
      `
        INSERT INTO parent_link_requests (id, parent_user_id, student_user_id, status)
        VALUES ($1, $2, $3, 'PENDING')
        ON CONFLICT DO NOTHING
      `,
      [id, parentId, studentId]
    );

    return res.status(201).json({
      id,
      childId,
      status: "PENDING",
      requestedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[parent] POST /parent/link-requests error", e);
    return err(res, 500, "INTERNAL", "Failed to create link request");
  }
});

/**
 * GET /api/parent/link-requests
 * Shows the parent's requests (used by the frontend "Your requests" list)
 */
parentRouter.get("/parent/link-requests", requireRole("PARENT"), async (req, res) => {
  try {
    const parentId = req.user!.id;

    const q = `
      SELECT
        r.id,
        r.status,
        r.requested_at AS "requestedAt",
        u.public_student_id AS "childId",
        u.email AS "childEmail"
      FROM parent_link_requests r
      JOIN users u ON u.id = r.student_user_id
      WHERE r.parent_user_id = $1
      ORDER BY r.requested_at DESC
    `;
    const r = await pool.query(q, [parentId]);

    return res.json(
      r.rows.map((row: any) => ({
        id: row.id,
        childId: row.childId ?? row.childEmail,
        status: row.status,
        requestedAt: row.requestedAt,
      }))
    );
  } catch (e: any) {
    console.error("[parent] GET /parent/link-requests error", e);
    return err(res, 500, "INTERNAL", "Failed to list link requests");
  }
});

/**
 * ADMIN: approve/reject a request
 * POST /api/admin/parent/link-requests/:id/decide
 * Body: { decision: "APPROVED" | "REJECTED" }
 */
parentRouter.post("/admin/parent/link-requests/:id/decide", requireRole("ADMIN"), async (req, res) => {
  try {
    const adminId = req.user!.id;
    const { id } = req.params as { id: string };
    const decision = String(req.body?.decision ?? "").toUpperCase();

    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return err(res, 400, "VALIDATION", "decision must be APPROVED or REJECTED");
    }

    const reqRow = await pool.query<{
      parent_user_id: string;
      student_user_id: string;
      status: string;
    }>(
      `
        SELECT parent_user_id, student_user_id, status
        FROM parent_link_requests
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    if ((reqRow.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Link request not found");

    const row = reqRow.rows[0];
    if (row.status !== "PENDING") {
      return res.status(200).json({ ok: true, status: row.status });
    }

    await pool.query(
      `
        UPDATE parent_link_requests
        SET status = $2,
            decided_at = now(),
            decided_by = $3
        WHERE id = $1
      `,
      [id, decision, adminId]
    );

    if (decision === "APPROVED") {
      await pool.query(
        `
          INSERT INTO parent_links (parent_user_id, student_user_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
        [row.parent_user_id, row.student_user_id]
      );
    }

    return res.json({ ok: true, status: decision });
  } catch (e: any) {
    console.error("[parent] POST /admin/parent/link-requests/:id/decide error", e);
    return err(res, 500, "INTERNAL", "Failed to decide link request");
  }
});

/**
 * -------------------------
 * PARENT CHILDREN (compat endpoints)
 * -------------------------
 */

// GET /api/parent/children
parentRouter.get("/parent/children", requireRole("PARENT"), async (req, res) => {
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

// POST /api/parent/children { studentPublicId } (preferred) OR { studentEmail } (legacy)
parentRouter.post("/parent/children", requireRole("PARENT"), async (req, res) => {
  try {
    const parentId = req.user!.id;

    const studentPublicId = String(req.body?.studentPublicId ?? "").trim();
    const studentEmail = String(req.body?.studentEmail ?? "").trim().toLowerCase();

    if (!studentPublicId && !studentEmail) {
      return err(res, 400, "VALIDATION", "Provide studentPublicId (preferred) or studentEmail (legacy)");
    }

    const identifier = studentPublicId || studentEmail;

    const studentId = await resolveStudentUserId(identifier);
    if (!studentId) return err(res, 404, "NOT_FOUND", "Student not found");

    // If parent cannot link directly, create a pending request instead
    const allowed = await parentCanLinkChildren(parentId);
    if (!allowed) {
      const id = newId();
      await pool.query(
        `
          INSERT INTO parent_link_requests (id, parent_user_id, student_user_id, status)
          VALUES ($1, $2, $3, 'PENDING')
          ON CONFLICT DO NOTHING
        `,
        [id, parentId, studentId]
      );

      return res.status(202).json({
        created: false,
        pending: true,
        message: "Link request submitted. Await admin approval.",
        childId: identifier,
      });
    }

    const linkQ = `
      INSERT INTO parent_links (parent_user_id, student_user_id)
      VALUES ($1, $2)
      ON CONFLICT (parent_user_id, student_user_id) DO NOTHING
      RETURNING 1 AS inserted
    `;
    const linkRes = await pool.query<{ inserted: number }>(linkQ, [parentId, studentId]);
    const created = (linkRes.rowCount ?? 0) > 0;

    const s = await pool.query<{ id: string; email: string; public_student_id: string | null }>(
      `SELECT id, email, public_student_id FROM users WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    const student = s.rows[0];

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

// DELETE /api/parent/children/:studentId
parentRouter.delete("/parent/children/:studentId", requireRole("PARENT"), async (req, res) => {
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

/**
 * -------------------------
 * RESULTS (Option A)
 * -------------------------
 * GET /api/parent/results?childId=STU-1001
 */
parentRouter.get("/parent/results", requireRole("PARENT"), async (req, res) => {
  try {
    const parentId = req.user!.id;
    const childId = String(req.query.childId ?? "").trim();

    if (!childId) return err(res, 400, "VALIDATION", "childId query param is required");

    const studentId = await resolveStudentUserId(childId);
    if (!studentId) return err(res, 404, "NOT_FOUND", "Student not found");

    const linked = await parentHasApprovedLink(parentId, studentId);
    if (!linked) return err(res, 403, "FORBIDDEN", "Parent is not linked to this student");

    // Seed demo results if none exist (fast Option A)
    const existing = await pool.query(`SELECT 1 FROM assessment_results WHERE student_user_id = $1 LIMIT 1`, [
      studentId,
    ]);

    if ((existing.rowCount ?? 0) === 0) {
      const today = new Date().toISOString().slice(0, 10);
      const seed = [
        { subject: "Mathematics", score: 78, outOf: 100, date: today },
        { subject: "English", score: 66, outOf: 100, date: today },
        { subject: "Life Sciences", score: 84, outOf: 100, date: today },
      ];

      for (const s of seed) {
        await pool.query(
          `
            INSERT INTO assessment_results (id, student_user_id, subject, score, out_of, assessed_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [newId(), studentId, s.subject, s.score, s.outOf, s.date]
        );
      }
    }

    const r = await pool.query(
      `
        SELECT id, subject, score, out_of AS "outOf", assessed_at AS "date"
        FROM assessment_results
        WHERE student_user_id = $1
        ORDER BY assessed_at DESC
      `,
      [studentId]
    );

    return res.json(r.rows);
  } catch (e: any) {
    console.error("[parent] GET /parent/results error", e);
    return err(res, 500, "INTERNAL", "Failed to load results");
  }
});

/**
 * -------------------------
 * FINANCE (Option A)
 * -------------------------
 * GET /api/parent/finance?childId=STU-1001
 *
 * IMPORTANT: Uses your real repo API:
 * - ensureAccount(userId)
 * - getSummary(userId)
 * - listTransactions(userId, opts)
 */
parentRouter.get("/parent/finance", requireRole("PARENT"), async (req, res) => {
  try {
    const parentId = req.user!.id;
    const childId = String(req.query.childId ?? "").trim();
    if (!childId) return err(res, 400, "VALIDATION", "childId query param is required");

    const studentId = await resolveStudentUserId(childId);
    if (!studentId) return err(res, 404, "NOT_FOUND", "Student not found");

    const linked = await parentHasApprovedLink(parentId, studentId);
    if (!linked) return err(res, 403, "FORBIDDEN", "Parent is not linked to this student");

    // Make sure finance account exists for the student
    await repos.finance.ensureAccount(studentId);

    const summary = await repos.finance.getSummary(studentId);
    const tx = await repos.finance.listTransactions(studentId, { limit: 50 });

    // Heuristic: last payment is typically a negative amount (money received)
    const lastPayment = tx.find((t) => t.amountCents < 0) ?? null;

    const balance = summary.balanceCents / 100;
    const status = summary.balanceCents > 0 ? "OVERDUE" : "OK";

    const notifications =
      status === "OVERDUE"
        ? [
            {
              id: "overdue",
              title: "Account overdue",
              body: `Outstanding balance: R ${balance.toFixed(2)}`,
              severity: "warning",
            },
          ]
        : [{ id: "ok", title: "Account up to date", body: "No outstanding balance.", severity: "info" }];

    const statementsCount = tx.filter((t) => /statement/i.test(t.description)).length;

    return res.json({
      balance,
      statements: statementsCount,
      lastPayment: lastPayment?.occurredAt ?? null,
      status,
      documents: tx.slice(0, 12).map((t) => {
        const kind = /statement/i.test(t.description) ? "STATEMENT" : "TRANSACTION";
        return {
          id: t.id,
          // frontend may be expecting "type", so we provide it too
          kind,
          type: kind,
          amount: t.amountCents / 100,
          occurredAt: t.occurredAt,
          description: t.description ?? null,
        };
      }),
      notifications,
    });
  } catch (e: any) {
    console.error("[parent] GET /parent/finance error", e);
    return err(res, 500, "INTERNAL", "Failed to load finance");
  }
});
