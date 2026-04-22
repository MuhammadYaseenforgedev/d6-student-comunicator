import { Router } from "express";
import crypto from "crypto";
import { pool } from "../config/db";
import { requireAccess, requireRole } from "../middleware/rbac";
import { repos } from "../persistence";
import {
  createParentLinkDecisionNotification,
  createResultNotifications,
} from "../lib/notifications";
import {
  isLecturerAllowedForStudent,
  isLecturerAssignedToModule,
  isStudentAllowedForModule,
} from "../lib/courseAccess";

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

function csvCell(v: string | number | null | undefined): string {
  const raw = v == null ? "" : String(v);
  if (!/[",\n\r]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

type AssessmentResultRow = {
  id: string;
  subject: string;
  score: number;
  outOf: number;
  date: string;
  moduleId?: string | null;
  moduleCode?: string | null;
  moduleName?: string | null;
};

const LEGACY_DEMO_RESULT_SIGNATURES = [
  { subject: "Mathematics", score: 78, outOf: 100 },
  { subject: "English", score: 66, outOf: 100 },
  { subject: "Life Sciences", score: 84, outOf: 100 },
] as const;

type AssessmentResultSignature = (typeof LEGACY_DEMO_RESULT_SIGNATURES)[number];

function signatureKey(sig: AssessmentResultSignature): string {
  return `${sig.subject}|${sig.score}|${sig.outOf}`;
}

const LEGACY_DEMO_SIGNATURE_KEYS = new Set(LEGACY_DEMO_RESULT_SIGNATURES.map(signatureKey));

function collectLegacyDemoRowIds(rows: AssessmentResultRow[]): string[] {
  const byDate = new Map<string, AssessmentResultRow[]>();

  for (const row of rows) {
    const key = `${row.subject}|${row.score}|${row.outOf}`;
    if (!LEGACY_DEMO_SIGNATURE_KEYS.has(key)) continue;
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date)!.push(row);
  }

  const ids: string[] = [];
  for (const items of byDate.values()) {
    // Safe guard: only match exact 1x each of the legacy seeded triples on the same date.
    if (items.length !== LEGACY_DEMO_RESULT_SIGNATURES.length) continue;

    const counts = new Map<string, number>();
    for (const row of items) {
      const key = `${row.subject}|${row.score}|${row.outOf}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const isExactLegacySet = LEGACY_DEMO_RESULT_SIGNATURES.every(
      (sig) => counts.get(signatureKey(sig)) === 1
    );
    if (!isExactLegacySet) continue;

    ids.push(...items.map((x) => x.id));
  }

  return ids;
}

function parseDateOnly(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parseIntField(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

async function listAssessmentResultsForStudent(studentId: string): Promise<AssessmentResultRow[]> {
  const r = await pool.query<AssessmentResultRow>(
    `
      SELECT
        ar.id,
        ar.subject,
        ar.score,
        ar.out_of AS "outOf",
        ar.assessed_at AS "date",
        fm.id AS "moduleId",
        fm.code AS "moduleCode",
        fm.name AS "moduleName"
      FROM assessment_results ar
      LEFT JOIN faculty_modules fm ON fm.id = ar.module_id
      WHERE student_user_id = $1
      ORDER BY ar.assessed_at DESC, ar.subject ASC
    `,
    [studentId]
  );
  return r.rows;
}

async function canStaffManageStudentResults(
  user: { id: string; role: string; adminScope?: string | null },
  studentId: string
): Promise<boolean> {
  const adminScope = String(user.adminScope ?? "").trim().toUpperCase();
  if (user.role === "ADMIN" && (adminScope === "ACADEMIC" || adminScope === "SUPER")) return true;
  if (user.role !== "LECTURER") return false;
  return isLecturerAllowedForStudent(pool, user.id, studentId);
}

async function canStaffManageModuleResults(
  user: { id: string; role: string; adminScope?: string | null },
  moduleId: string
): Promise<boolean> {
  const adminScope = String(user.adminScope ?? "").trim().toUpperCase();
  if (user.role === "ADMIN" && (adminScope === "ACADEMIC" || adminScope === "SUPER")) return true;
  if (user.role !== "LECTURER") return false;
  return isLecturerAssignedToModule(pool, user.id, moduleId);
}

async function assertModuleStudentEnrollment(moduleId: string, studentId: string): Promise<boolean> {
  return isStudentAllowedForModule(pool, studentId, moduleId);
}

async function upsertAssessmentResultForStudent(input: {
  studentId: string;
  subject: string;
  score: number;
  outOf: number;
  date: string;
  moduleId: string | null;
}): Promise<AssessmentResultRow> {
  if (input.moduleId) {
    const existing = await pool.query<{ id: string }>(
      `
        SELECT id
        FROM assessment_results
        WHERE student_user_id = $1
          AND module_id = $2
          AND lower(subject) = lower($3)
          AND assessed_at = $4::date
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [input.studentId, input.moduleId, input.subject, input.date]
    );

    if ((existing.rowCount ?? 0) > 0) {
      const updated = await pool.query<AssessmentResultRow>(
        `
          UPDATE assessment_results ar
          SET
            score = $2,
            out_of = $3,
            subject = $4,
            assessed_at = $5::date
          FROM faculty_modules fm
          WHERE ar.id = $1
            AND fm.id = ar.module_id
          RETURNING
            ar.id,
            ar.subject,
            ar.score,
            ar.out_of AS "outOf",
            ar.assessed_at AS "date",
            fm.id AS "moduleId",
            fm.code AS "moduleCode",
            fm.name AS "moduleName"
        `,
        [existing.rows[0].id, input.score, input.outOf, input.subject, input.date]
      );
      return updated.rows[0];
    }
  }

  const created = await pool.query<AssessmentResultRow>(
    `
      INSERT INTO assessment_results (
        id,
        student_user_id,
        subject,
        score,
        out_of,
        assessed_at,
        module_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        subject,
        score,
        out_of AS "outOf",
        assessed_at AS "date",
        module_id AS "moduleId"
    `,
    [newId(), input.studentId, input.subject, input.score, input.outOf, input.date, input.moduleId]
  );

  if (!input.moduleId) return created.rows[0];

  const withModule = await pool.query<AssessmentResultRow>(
    `
      SELECT
        ar.id,
        ar.subject,
        ar.score,
        ar.out_of AS "outOf",
        ar.assessed_at AS "date",
        fm.id AS "moduleId",
        fm.code AS "moduleCode",
        fm.name AS "moduleName"
      FROM assessment_results ar
      LEFT JOIN faculty_modules fm ON fm.id = ar.module_id
      WHERE ar.id = $1
      LIMIT 1
    `,
    [created.rows[0].id]
  );
  return withModule.rows[0];
}

async function getStudentResultLabel(studentId: string): Promise<string> {
  const result = await pool.query<{ public_student_id: string | null; email: string }>(
    `
      SELECT public_student_id, email
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [studentId]
  );

  const row = result.rows[0];
  if (!row) return studentId;

  const publicStudentId = String(row.public_student_id ?? "").trim();
  if (publicStudentId) return publicStudentId;

  return row.email;
}

function buildResultsCsv(childId: string, rows: AssessmentResultRow[]): string {
  const generatedAt = new Date().toISOString();
  const lines: string[] = [
    `Generated At,${csvCell(generatedAt)}`,
    `Child,${csvCell(childId)}`,
    "",
    "Subject,Score,Out Of,Percentage,Date",
  ];

  if (rows.length === 0) {
    lines.push("No results,,,,");
  } else {
    for (const r of rows) {
      const outOf = r.outOf > 0 ? r.outOf : 100;
      const pct = Math.round((r.score / outOf) * 100);
      lines.push(
        `${csvCell(r.subject)},${csvCell(r.score)},${csvCell(outOf)},${csvCell(`${pct}%`)},${csvCell(r.date)}`
      );
    }
  }

  return `\uFEFF${lines.join("\n")}\n`;
}

/**
 * Resolves a student by either:
 * - user id (UUID)
 * - student number/public student ID
 * - email (legacy fallback)
 *
 * Returns the student's user id or null.
 */
async function resolveStudentUserId(childId: string): Promise<string | null> {
  if (isUuid(childId)) {
    const byId = await pool.query<{ id: string }>(
      `
        SELECT id
        FROM users
        WHERE role = 'STUDENT'
          AND id = $1
        LIMIT 1
      `,
      [childId]
    );
    if ((byId.rowCount ?? 0) > 0) return byId.rows[0].id;
  }

  const q = `
    SELECT id
    FROM users
    WHERE role = 'STUDENT'
      AND (public_student_id = $1 OR lower(email) = lower($1))
    LIMIT 1
  `;
  const r = await pool.query<{ id: string }>(q, [childId]);
  return r.rows[0]?.id ?? null;
}

function normalizeSouthAfricanId(v: unknown): string {
  return String(v ?? "").replace(/\D+/g, "");
}

function isValidSouthAfricanId(v: string): boolean {
  return /^\d{13}$/.test(v);
}

/**
 * Resolves a student by South African ID.
 * Returns the student's user id or null.
 */
async function resolveStudentUserIdBySouthAfricanId(southAfricanId: string): Promise<string | null> {
  const q = `
    SELECT id
    FROM users
    WHERE role = 'STUDENT'
      AND south_african_id = $1
    LIMIT 1
  `;
  const r = await pool.query<{ id: string }>(q, [southAfricanId]);
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
 * PARENT creates a link request using the student's South African ID.
 * ADMIN approves/rejects.
 */

/**
 * POST /api/parent/link-requests
 * Body: { southAfricanId: "0012311234088" }
 */
parentRouter.post("/parent/link-requests", requireRole("PARENT"), async (req, res) => {
  try {
    const parentId = req.user!.id;
    const southAfricanId = normalizeSouthAfricanId(req.body?.southAfricanId ?? req.body?.childId);
    if (!southAfricanId || !isValidSouthAfricanId(southAfricanId)) {
      return err(res, 400, "VALIDATION", "southAfricanId is required and must be exactly 13 digits");
    }

    const studentId = await resolveStudentUserIdBySouthAfricanId(southAfricanId);
    if (!studentId) return err(res, 404, "NOT_FOUND", "Student not found");

    // Already approved link?
    if (await parentHasApprovedLink(parentId, studentId)) {
      return res.status(200).json({
        id: "already-linked",
        childId: southAfricanId,
        southAfricanId,
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
      childId: southAfricanId,
      southAfricanId,
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
        u.south_african_id AS "southAfricanId",
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
        childId: row.southAfricanId ?? row.childId ?? row.childEmail,
        southAfricanId: row.southAfricanId ?? null,
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
parentRouter.post(
  "/admin/parent/link-requests/:id/decide",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
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

    await createParentLinkDecisionNotification({
      requestId: id,
      parentId: row.parent_user_id,
      studentId: row.student_user_id,
      decision: decision as "APPROVED" | "REJECTED",
    }).catch((e) => {
      console.error("[parent] parent-link notification fan-out failed", e);
    });

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
parentRouter.get("/children", requireRole("PARENT"), async (req, res) => {
  try {
    const parentId = req.user!.id;

    const q = `
      SELECT
        u.id AS "studentUserId",
        u.email,
        u.public_student_id
      FROM parent_links pl
      JOIN users u ON u.id = pl.student_user_id
      WHERE pl.parent_user_id = $1
      ORDER BY lower(u.email) ASC
    `;
    const r = await pool.query<{ studentUserId: string; email: string; public_student_id: string | null }>(q, [
      parentId,
    ]);

    const children = r.rows.map((x) => ({
      id: x.studentUserId,
      userId: x.studentUserId,
      childUserId: x.studentUserId,
      studentUserId: x.studentUserId,
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

// POST /api/parent/children { southAfricanId }
parentRouter.post("/children", requireRole("PARENT"), async (req, res) => {
  try {
    const parentId = req.user!.id;

    const rawIdentifier = String(
      req.body?.childId ??
        req.body?.studentNumber ??
        req.body?.publicStudentId ??
        req.body?.southAfricanId ??
        ""
    ).trim();
    if (!rawIdentifier) {
      return err(
        res,
        400,
        "VALIDATION",
        "childId is required (student number/public student ID or South African ID)"
      );
    }

    const southAfricanId = normalizeSouthAfricanId(rawIdentifier);

    let studentId: string | null = null;
    if (isValidSouthAfricanId(southAfricanId)) {
      studentId = await resolveStudentUserIdBySouthAfricanId(southAfricanId);
    }
    if (!studentId) {
      studentId = await resolveStudentUserId(rawIdentifier);
    }
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
        childId: rawIdentifier,
        southAfricanId: isValidSouthAfricanId(southAfricanId) ? southAfricanId : null,
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
    if (!student) return err(res, 404, "NOT_FOUND", "Student not found");

    return res.status(created ? 201 : 200).json({
      created,
      child: {
        id: student.id,
        userId: student.id,
        childUserId: student.id,
        studentUserId: student.id,
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
parentRouter.delete("/children/:studentId", requireRole("PARENT"), async (req, res) => {
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
 * GET /api/parent/student/results
 */
parentRouter.get("/student/results", requireRole("STUDENT"), async (req, res) => {
  try {
    const rows = await listAssessmentResultsForStudent(req.user!.id);
    return res.json(rows);
  } catch (e: any) {
    console.error("[parent] GET /student/results error", e);
    return err(res, 500, "INTERNAL", "Failed to load results");
  }
  }
);

/**
 * GET /api/parent/student/results/download
 * Download the signed-in student's own results.
 */
parentRouter.get("/student/results/download", requireRole("STUDENT"), async (req, res) => {
  try {
    const studentId = req.user!.id;
    const childId = await getStudentResultLabel(studentId);
    const rows = await listAssessmentResultsForStudent(studentId);
    const csv = buildResultsCsv(childId, rows);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const safeChildId = childId.replace(/[^a-z0-9._-]+/gi, "_");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="results-${safeChildId || "student"}-${dateStamp}.csv"`
    );

    return res.status(200).send(csv);
  } catch (e: any) {
    console.error("[parent] GET /student/results/download error", e);
    return err(res, 500, "INTERNAL", "Failed to download results");
  }
});

/**
 * -------------------------
 * RESULTS (Parent)
 * -------------------------
 * GET /api/parent/results?childId=STU-1001
 */
parentRouter.get("/results", requireRole("PARENT"), async (req, res) => {
  try {
    const parentId = req.user!.id;
    const childId = String(req.query.childId ?? "").trim();

    if (!childId) return err(res, 400, "VALIDATION", "childId query param is required");

    const studentId = await resolveStudentUserId(childId);
    if (!studentId) return err(res, 404, "NOT_FOUND", "Student not found");

    const linked = await parentHasApprovedLink(parentId, studentId);
    if (!linked) return err(res, 403, "FORBIDDEN", "Parent is not linked to this student");

    const rows = await listAssessmentResultsForStudent(studentId);
    return res.json(rows);
  } catch (e: any) {
    console.error("[parent] GET /results error", e);
    return err(res, 500, "INTERNAL", "Failed to load results");
  }
});

/**
 * ADMIN: list link requests (queue)
 * GET /api/admin/parent/link-requests?status=PENDING|APPROVED|REJECTED|ALL
 */
parentRouter.get(
  "/admin/parent/link-requests",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const statusRaw = String(req.query.status ?? "PENDING").trim().toUpperCase();
    const valid = new Set(["PENDING", "APPROVED", "REJECTED", "ALL"]);
    if (!valid.has(statusRaw)) {
      return err(res, 400, "VALIDATION", "status must be PENDING, APPROVED, REJECTED, or ALL");
    }

    const statusFilter = statusRaw === "ALL" ? null : statusRaw;

    const params: string[] = [];
    let where = "";
    if (statusFilter) {
      params.push(statusFilter);
      where = `WHERE r.status = $1`;
    }

    const q = `
      SELECT
        r.id,
        r.status,
        r.requested_at AS "requestedAt",
        r.decided_at AS "decidedAt",
        p.id AS "parentUserId",
        p.email AS "parentEmail",
        s.id AS "childUserId",
        s.email AS "childEmail",
        s.south_african_id AS "southAfricanId",
        s.public_student_id AS "childId",
        d.id AS "decidedById",
        d.email AS "decidedByEmail"
      FROM parent_link_requests r
      JOIN users p ON p.id = r.parent_user_id
      JOIN users s ON s.id = r.student_user_id
      LEFT JOIN users d ON d.id = r.decided_by
      ${where}
      ORDER BY
        CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END,
        r.requested_at DESC
    `;
    const r = await pool.query(q, params);

    return res.json(
      r.rows.map((row: any) => ({
        id: row.id,
        status: row.status,
        requestedAt: row.requestedAt,
        decidedAt: row.decidedAt ?? null,
        parentUserId: row.parentUserId,
        parentEmail: row.parentEmail,
        childUserId: row.childUserId,
        childEmail: row.childEmail,
        childId: row.southAfricanId ?? row.childId ?? row.childEmail,
        southAfricanId: row.southAfricanId ?? null,
        decidedById: row.decidedById ?? null,
        decidedByEmail: row.decidedByEmail ?? null,
      }))
    );
  } catch (e: any) {
    console.error("[parent] GET /admin/parent/link-requests error", e);
    return err(res, 500, "INTERNAL", "Failed to list link requests");
  }
  }
);

/**
 * GET /api/parent/results/download?childId=STU-1001
 * Download linked student's results (parent only).
 */
parentRouter.get("/results/download", requireRole("PARENT"), async (req, res) => {
  try {
    const parentId = req.user!.id;
    const childId = String(req.query.childId ?? "").trim();
    if (!childId) return err(res, 400, "VALIDATION", "childId query param is required");

    const studentId = await resolveStudentUserId(childId);
    if (!studentId) return err(res, 404, "NOT_FOUND", "Student not found");

    const linked = await parentHasApprovedLink(parentId, studentId);
    if (!linked) return err(res, 403, "FORBIDDEN", "Parent is not linked to this student");

    const rows = await listAssessmentResultsForStudent(studentId);
    const csv = buildResultsCsv(childId, rows);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const safeChildId = childId.replace(/[^a-z0-9._-]+/gi, "_");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="results-${safeChildId || "child"}-${dateStamp}.csv"`
    );

    return res.status(200).send(csv);
  } catch (e: any) {
    console.error("[parent] GET /results/download error", e);
    return err(res, 500, "INTERNAL", "Failed to download results");
  }
});

/**
 * GET /api/parent/attendance?childId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
parentRouter.get("/attendance", requireRole("PARENT"), async (req, res) => {
  try {
    const parentId = req.user!.id;
    const childId = String(req.query.childId ?? "").trim();
    if (!childId) return err(res, 400, "VALIDATION", "childId query param is required");

    const from = req.query.from ? parseDateOnly(req.query.from) : null;
    const to = req.query.to ? parseDateOnly(req.query.to) : null;
    if (req.query.from && !from) return err(res, 400, "VALIDATION", "from must be YYYY-MM-DD");
    if (req.query.to && !to) return err(res, 400, "VALIDATION", "to must be YYYY-MM-DD");

    const studentId = await resolveStudentUserId(childId);
    if (!studentId) return err(res, 404, "NOT_FOUND", "Student not found");

    const linked = await parentHasApprovedLink(parentId, studentId);
    if (!linked) return err(res, 403, "FORBIDDEN", "Parent is not linked to this student");

    const rows = await pool.query<{
      session_id: string;
      attendance_date: string;
      starts_at: string | null;
      ends_at: string | null;
      module_id: string;
      module_code: string;
      module_name: string;
      faculty_name: string;
      status: string;
      marked_at: string;
    }>(
      `
        SELECT
          s.id AS session_id,
          s.attendance_date,
          s.starts_at,
          s.ends_at,
          fm.id AS module_id,
          fm.code AS module_code,
          fm.name AS module_name,
          f.name AS faculty_name,
          ar.status,
          ar.marked_at
        FROM attendance_records ar
        JOIN attendance_sessions s ON s.id = ar.session_id
        JOIN faculty_modules fm ON fm.id = s.module_id
        JOIN faculties f ON f.id = fm.faculty_id
        WHERE ar.student_id = $1
          AND ($2::date IS NULL OR s.attendance_date >= $2::date)
          AND ($3::date IS NULL OR s.attendance_date <= $3::date)
        ORDER BY s.attendance_date DESC, ar.marked_at DESC
      `,
      [studentId, from, to]
    );

    const value = rows.rows.map((r) => ({
      sessionId: r.session_id,
      date: r.attendance_date,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      moduleId: r.module_id,
      moduleCode: r.module_code,
      moduleName: r.module_name,
      facultyName: r.faculty_name,
      status: r.status,
      markedAt: r.marked_at,
    }));

    return res.json({ value, count: value.length });
  } catch (e: any) {
    console.error("[parent] GET /attendance error", e);
    return err(res, 500, "INTERNAL", "Failed to load attendance");
  }
});

/**
 * -------------------------
 * RESULTS MANAGEMENT (ADMIN/LECTURER)
 * -------------------------
 */

// GET /api/parent/admin/results?childId=STU-1001
parentRouter.get(
  "/admin/results",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;
    const childId = String(req.query.childId ?? "").trim();
    if (!childId) return err(res, 400, "VALIDATION", "childId query param is required");

    const studentId = await resolveStudentUserId(childId);
    if (!studentId) return err(res, 404, "NOT_FOUND", "Student not found");

    const allowed = await canStaffManageStudentResults(user, studentId);
    if (!allowed) return err(res, 403, "FORBIDDEN", "Lecturer cannot access results for this student");

    const rows = await listAssessmentResultsForStudent(studentId);
    return res.json({ value: rows, count: rows.length });
  } catch (e: any) {
    console.error("[parent] GET /admin/results error", e);
    return err(res, 500, "INTERNAL", "Failed to load results");
  }
  }
);

// GET /api/parent/admin/results/download?childId=STU-1001
parentRouter.get(
  "/admin/results/download",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;
    const childId = String(req.query.childId ?? "").trim();
    if (!childId) return err(res, 400, "VALIDATION", "childId query param is required");

    const studentId = await resolveStudentUserId(childId);
    if (!studentId) return err(res, 404, "NOT_FOUND", "Student not found");

    const allowed = await canStaffManageStudentResults(user, studentId);
    if (!allowed) return err(res, 403, "FORBIDDEN", "Lecturer cannot access results for this student");

    const rows = await listAssessmentResultsForStudent(studentId);
    const csv = buildResultsCsv(childId, rows);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const safeChildId = childId.replace(/[^a-z0-9._-]+/gi, "_");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="results-${safeChildId || "child"}-${dateStamp}.csv"`
    );

    return res.status(200).send(csv);
  } catch (e: any) {
    console.error("[parent] GET /admin/results/download error", e);
    return err(res, 500, "INTERNAL", "Failed to download results");
  }
  }
);

/**
 * POST /api/parent/admin/results/cleanup-demo
 * Body: { childIds: string[], dryRun?: boolean }
 *
 * Removes only the exact legacy seeded trio (Mathematics 78, English 66, Life Sciences 84)
 * and only for the selected children.
 * `dryRun` defaults to true for safety.
 */
parentRouter.post(
  "/admin/results/cleanup-demo",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const rawChildIds: unknown[] = Array.isArray(req.body?.childIds) ? req.body.childIds : [];
    const childIds: string[] = rawChildIds
      .map((v: unknown) => String(v ?? "").trim())
      .filter((v): v is string => v.length > 0);

    if (childIds.length === 0) {
      return err(
        res,
        400,
        "VALIDATION",
        "childIds must be a non-empty array of student numbers"
      );
    }
    if (childIds.length > 100) {
      return err(res, 400, "VALIDATION", "childIds supports up to 100 values per request");
    }

    const uniqueChildIds: string[] = [...new Set(childIds)];
    const dryRun = req.body?.dryRun !== false;

    const results: Array<{
      childId: string;
      studentId: string | null;
      status: "OK" | "NOT_FOUND";
      candidateCount: number;
      deletedCount: number;
      candidates: AssessmentResultRow[];
    }> = [];

    let totalCandidates = 0;
    let totalDeleted = 0;

    for (const childId of uniqueChildIds) {
      const studentId = await resolveStudentUserId(childId);

      if (!studentId) {
        results.push({
          childId,
          studentId: null,
          status: "NOT_FOUND",
          candidateCount: 0,
          deletedCount: 0,
          candidates: [],
        });
        continue;
      }

      const candidatesRaw = await pool.query<AssessmentResultRow>(
        `
          SELECT id, subject, score, out_of AS "outOf", assessed_at AS "date"
          FROM assessment_results
          WHERE student_user_id = $1
            AND (
              (subject = $2 AND score = $3 AND out_of = $4)
              OR (subject = $5 AND score = $6 AND out_of = $7)
              OR (subject = $8 AND score = $9 AND out_of = $10)
            )
          ORDER BY assessed_at DESC, subject ASC
        `,
        [
          studentId,
          LEGACY_DEMO_RESULT_SIGNATURES[0].subject,
          LEGACY_DEMO_RESULT_SIGNATURES[0].score,
          LEGACY_DEMO_RESULT_SIGNATURES[0].outOf,
          LEGACY_DEMO_RESULT_SIGNATURES[1].subject,
          LEGACY_DEMO_RESULT_SIGNATURES[1].score,
          LEGACY_DEMO_RESULT_SIGNATURES[1].outOf,
          LEGACY_DEMO_RESULT_SIGNATURES[2].subject,
          LEGACY_DEMO_RESULT_SIGNATURES[2].score,
          LEGACY_DEMO_RESULT_SIGNATURES[2].outOf,
        ]
      );

      const matchedIds = new Set(collectLegacyDemoRowIds(candidatesRaw.rows));
      const candidates = candidatesRaw.rows.filter((row) => matchedIds.has(row.id));
      totalCandidates += candidates.length;

      let deletedCount = 0;
      if (!dryRun && candidates.length > 0) {
        const deleted = await pool.query<{ id: string }>(
          `
            DELETE FROM assessment_results
            WHERE id = ANY($1::uuid[])
            RETURNING id
          `,
          [candidates.map((x) => x.id)]
        );
        deletedCount = deleted.rowCount ?? 0;
        totalDeleted += deletedCount;
      }

      results.push({
        childId,
        studentId,
        status: "OK",
        candidateCount: candidates.length,
        deletedCount,
        candidates,
      });
    }

    return res.json({
      dryRun,
      signature: LEGACY_DEMO_RESULT_SIGNATURES,
      requestedCount: uniqueChildIds.length,
      totalCandidates,
      totalDeleted,
      results,
    });
  } catch (e: any) {
    console.error("[parent] POST /admin/results/cleanup-demo error", e);
    return err(res, 500, "INTERNAL", "Failed to cleanup demo results");
  }
  }
);

// POST /api/parent/admin/results
// Body: { childId, subject, score, outOf?, date? }
parentRouter.post(
  "/admin/results",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;
    const childId = String(req.body?.childId ?? "").trim();
    const subject = String(req.body?.subject ?? "").trim();
    const score = parseIntField(req.body?.score);
    const outOfRaw = parseIntField(req.body?.outOf);
    const dateRaw = req.body?.date;
    const moduleId = String(req.body?.moduleId ?? "").trim();

    if (!childId) return err(res, 400, "VALIDATION", "childId is required");
    if (!subject) return err(res, 400, "VALIDATION", "subject is required");
    if (score === null) return err(res, 400, "VALIDATION", "score must be an integer");

    const outOf = outOfRaw ?? 100;
    if (outOf <= 0) return err(res, 400, "VALIDATION", "outOf must be greater than 0");
    if (score < 0 || score > outOf) {
      return err(res, 400, "VALIDATION", "score must be between 0 and outOf");
    }
    if (moduleId && !isUuid(moduleId)) {
      return err(res, 400, "VALIDATION", "moduleId must be a UUID");
    }

    let date = new Date().toISOString().slice(0, 10);
    if (dateRaw !== undefined) {
      const parsedDate = parseDateOnly(dateRaw);
      if (!parsedDate) return err(res, 400, "VALIDATION", "date must be YYYY-MM-DD");
      date = parsedDate;
    }

    const studentId = await resolveStudentUserId(childId);
    if (!studentId) return err(res, 404, "NOT_FOUND", "Student not found");

    if (moduleId) {
      const moduleAllowed = await canStaffManageModuleResults(user, moduleId);
      if (!moduleAllowed) {
        return err(res, 403, "FORBIDDEN", "Lecturer cannot manage this module marksheet");
      }
      const enrolled = await assertModuleStudentEnrollment(moduleId, studentId);
      if (!enrolled) {
        return err(res, 400, "VALIDATION", "Student is not enrolled in this module");
      }
    } else {
      const allowed = await canStaffManageStudentResults(user, studentId);
      if (!allowed) return err(res, 403, "FORBIDDEN", "Lecturer cannot create results for this student");
    }

    const created = await pool.query<AssessmentResultRow>(
      `
        INSERT INTO assessment_results (id, student_user_id, subject, score, out_of, assessed_at, module_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, subject, score, out_of AS "outOf", assessed_at AS "date", module_id AS "moduleId"
      `,
      [newId(), studentId, subject, score, outOf, date, moduleId || null]
    );

    await createResultNotifications({
      resultId: created.rows[0].id,
      studentId,
      subject: created.rows[0].subject,
      score: created.rows[0].score,
      outOf: created.rows[0].outOf,
      date: created.rows[0].date,
      action: "PUBLISHED",
    }).catch((e) => {
      console.error("[parent] result notification fan-out failed", e);
    });

    return res.status(201).json(created.rows[0]);
  } catch (e: any) {
    console.error("[parent] POST /admin/results error", e);
    return err(res, 500, "INTERNAL", "Failed to create result");
  }
  }
);

// POST /api/parent/admin/results/:id/update
// Body: { subject?, score?, outOf?, date? }
parentRouter.post(
  "/admin/results/:id/update",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id ?? "").trim();
    if (!isUuid(id)) return err(res, 400, "VALIDATION", "id must be a UUID");

    const hasSubject = req.body?.subject !== undefined;
    const hasScore = req.body?.score !== undefined;
    const hasOutOf = req.body?.outOf !== undefined;
    const hasDate = req.body?.date !== undefined;

    if (!hasSubject && !hasScore && !hasOutOf && !hasDate) {
      return err(res, 400, "VALIDATION", "Provide at least one field: subject, score, outOf, date");
    }

    const current = await pool.query<{
      student_user_id: string;
      subject: string;
      score: number;
      out_of: number;
      assessed_at: string;
      module_id: string | null;
    }>(
      `
        SELECT student_user_id, subject, score, out_of, assessed_at, module_id
        FROM assessment_results
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );
    if ((current.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Result not found");

    const currentRow = current.rows[0];
    const allowed = currentRow.module_id
      ? await canStaffManageModuleResults(user, currentRow.module_id)
      : await canStaffManageStudentResults(user, currentRow.student_user_id);
    if (!allowed) {
      return err(res, 403, "FORBIDDEN", "Lecturer cannot update this result");
    }

    let subject: string | null = null;
    if (hasSubject) {
      subject = String(req.body?.subject ?? "").trim();
      if (!subject) return err(res, 400, "VALIDATION", "subject cannot be empty");
    }

    let score: number | null = null;
    if (hasScore) {
      score = parseIntField(req.body?.score);
      if (score === null) return err(res, 400, "VALIDATION", "score must be an integer");
    }

    let outOf: number | null = null;
    if (hasOutOf) {
      outOf = parseIntField(req.body?.outOf);
      if (outOf === null || outOf <= 0) return err(res, 400, "VALIDATION", "outOf must be an integer > 0");
    }

    let date: string | null = null;
    if (hasDate) {
      date = parseDateOnly(req.body?.date);
      if (!date) return err(res, 400, "VALIDATION", "date must be YYYY-MM-DD");
    }

    const nextOutOf = outOf ?? currentRow.out_of;
    const nextScore = score ?? currentRow.score;

    if (nextScore < 0 || nextScore > nextOutOf) {
      return err(res, 400, "VALIDATION", "score must be between 0 and outOf");
    }

    const updated = await pool.query<AssessmentResultRow>(
      `
        UPDATE assessment_results
        SET subject = COALESCE($2, subject),
            score = COALESCE($3, score),
            out_of = COALESCE($4, out_of),
            assessed_at = COALESCE($5, assessed_at)
        WHERE id = $1
        RETURNING id, subject, score, out_of AS "outOf", assessed_at AS "date"
      `,
      [id, subject, score, outOf, date]
    );

    const updatedRow = updated.rows[0];
    await createResultNotifications({
      resultId: updatedRow.id,
      studentId: currentRow.student_user_id,
      subject: updatedRow.subject,
      score: updatedRow.score,
      outOf: updatedRow.outOf,
      date: updatedRow.date,
      action: "UPDATED",
    }).catch((e) => {
      console.error("[parent] result update notification fan-out failed", e);
    });

    return res.json(updatedRow);
  } catch (e: any) {
    console.error("[parent] POST /admin/results/:id/update error", e);
    return err(res, 500, "INTERNAL", "Failed to update result");
  }
  }
);

// DELETE /api/parent/admin/results/:id
parentRouter.delete(
  "/admin/results/:id",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id ?? "").trim();
    if (!isUuid(id)) return err(res, 400, "VALIDATION", "id must be a UUID");

    const existing = await pool.query<{ student_user_id: string; module_id: string | null }>(
      `
        SELECT student_user_id, module_id
        FROM assessment_results
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );
    if ((existing.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Result not found");

    const allowed = existing.rows[0].module_id
      ? await canStaffManageModuleResults(user, String(existing.rows[0].module_id))
      : await canStaffManageStudentResults(user, existing.rows[0].student_user_id);
    if (!allowed) {
      return err(res, 403, "FORBIDDEN", "Lecturer cannot delete this result");
    }

    const r = await pool.query(`DELETE FROM assessment_results WHERE id = $1`, [id]);
    if ((r.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Result not found");

    return res.status(204).send();
  } catch (e: any) {
    console.error("[parent] DELETE /admin/results/:id error", e);
    return err(res, 500, "INTERNAL", "Failed to delete result");
  }
  }
);

parentRouter.get(
  "/admin/results/module/:moduleId/marksheet",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const user = req.user!;
      const moduleId = String(req.params.moduleId ?? "").trim();
      const subject = String(req.query.subject ?? "").trim();
      const date = parseDateOnly(req.query.date) ?? new Date().toISOString().slice(0, 10);

      if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");

      const allowed = await canStaffManageModuleResults(user, moduleId);
      if (!allowed) return err(res, 403, "FORBIDDEN", "Lecturer cannot access this module marksheet");

      const moduleResult = await pool.query<{ id: string; code: string; name: string; course_name: string }>(
        `
          SELECT fm.id, fm.code, fm.name, c.name AS course_name
          FROM faculty_modules fm
          JOIN courses c ON c.id = fm.course_id
          WHERE fm.id = $1
          LIMIT 1
        `,
        [moduleId]
      );
      if ((moduleResult.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Module not found");

      const rows = await pool.query<{
        id: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
        public_student_id: string | null;
        result_id: string | null;
        score: number | null;
        out_of: number | null;
        assessed_at: string | null;
      }>(
        `
          SELECT
            u.id,
            u.email,
            u.first_name,
            u.last_name,
            u.public_student_id,
            ar.id AS result_id,
            ar.score,
            ar.out_of,
            ar.assessed_at
          FROM faculty_modules fm
          JOIN student_module_enrollments sme
            ON sme.module_id = fm.id
          JOIN student_courses sc
            ON sc.student_user_id = sme.student_id
           AND sc.course_id = fm.course_id
           AND sc.status = 'ACTIVE'
          JOIN users u ON u.id = sme.student_id
          LEFT JOIN LATERAL (
            SELECT ar2.id, ar2.score, ar2.out_of, ar2.assessed_at
            FROM assessment_results ar2
            WHERE ar2.student_user_id = u.id
              AND ar2.module_id = fm.id
              AND ($2::text = '' OR lower(ar2.subject) = lower($2))
              AND ar2.assessed_at = $3::date
            ORDER BY ar2.created_at DESC, ar2.id DESC
            LIMIT 1
          ) ar ON TRUE
          WHERE fm.id = $1
          ORDER BY lower(u.email) ASC
        `,
        [moduleId, subject, date]
      );

      return res.json({
        module: {
          id: moduleResult.rows[0].id,
          code: moduleResult.rows[0].code,
          name: moduleResult.rows[0].name,
          courseName: moduleResult.rows[0].course_name,
        },
        subject,
        date,
        value: rows.rows.map((row) => ({
          id: row.id,
          email: row.email,
          firstName: row.first_name,
          lastName: row.last_name,
          studentNumber: row.public_student_id,
          resultId: row.result_id,
          score: row.score,
          outOf: row.out_of,
          assessedAt: row.assessed_at,
        })),
        count: rows.rows.length,
      });
    } catch (e: any) {
      console.error("[parent] GET /admin/results/module/:moduleId/marksheet error", e);
      return err(res, 500, "INTERNAL", "Failed to load lecturer marksheet");
    }
  }
);

parentRouter.post(
  "/admin/results/module/:moduleId/bulk",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const user = req.user!;
      const moduleId = String(req.params.moduleId ?? "").trim();
      const subject = String(req.body?.subject ?? "").trim();
      const outOf = parseIntField(req.body?.outOf);
      const date = parseDateOnly(req.body?.date) ?? new Date().toISOString().slice(0, 10);
      const rowsRaw = Array.isArray(req.body?.rows) ? req.body.rows : [];

      if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");
      if (!subject) return err(res, 400, "VALIDATION", "subject is required");
      if (outOf === null || outOf <= 0) return err(res, 400, "VALIDATION", "outOf must be greater than 0");
      if (rowsRaw.length === 0) return err(res, 400, "VALIDATION", "rows must be a non-empty array");

      const allowed = await canStaffManageModuleResults(user, moduleId);
      if (!allowed) return err(res, 403, "FORBIDDEN", "Lecturer cannot manage this module marksheet");

      const rows: Array<{ studentId: string; score: number | null }> = rowsRaw.map((row: unknown) => ({
        studentId: String((row as { studentId?: unknown }).studentId ?? "").trim(),
        score: parseIntField((row as { score?: unknown }).score),
      }));

      if (rows.some((row) => !isUuid(row.studentId) || row.score === null || row.score < 0 || row.score > outOf)) {
        return err(res, 400, "VALIDATION", "Each row must include studentId and score within range");
      }

      for (const row of rows) {
        const enrolled = await assertModuleStudentEnrollment(moduleId, row.studentId);
        if (!enrolled) {
          return err(res, 400, "VALIDATION", "One or more students are not enrolled in this module");
        }
      }

      const saved: AssessmentResultRow[] = [];
      for (const row of rows) {
        const result = await upsertAssessmentResultForStudent({
          studentId: row.studentId,
          subject,
          score: row.score as number,
          outOf,
          date,
          moduleId,
        });
        saved.push(result);
        await createResultNotifications({
          resultId: result.id,
          studentId: row.studentId,
          subject: result.subject,
          score: result.score,
          outOf: result.outOf,
          date: result.date,
          action: "UPDATED",
        }).catch((notificationError) => {
          console.error("[parent] module marksheet notification failed", notificationError);
        });
      }

      return res.json({ ok: true, count: saved.length, value: saved });
    } catch (e: any) {
      console.error("[parent] POST /admin/results/module/:moduleId/bulk error", e);
      return err(res, 500, "INTERNAL", "Failed to save lecturer marksheet");
    }
  }
);

parentRouter.post(
  "/admin/results/module/:moduleId/students/:studentId",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const user = req.user!;
      const moduleId = String(req.params.moduleId ?? "").trim();
      const studentId = String(req.params.studentId ?? "").trim();
      const subject = String(req.body?.subject ?? "").trim();
      const score = parseIntField(req.body?.score);
      const outOf = parseIntField(req.body?.outOf);
      const date = parseDateOnly(req.body?.date) ?? new Date().toISOString().slice(0, 10);

      if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");
      if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "studentId must be a UUID");
      if (!subject) return err(res, 400, "VALIDATION", "subject is required");
      if (score === null) return err(res, 400, "VALIDATION", "score must be an integer");
      if (outOf === null || outOf <= 0) return err(res, 400, "VALIDATION", "outOf must be greater than 0");
      if (score < 0 || score > outOf) return err(res, 400, "VALIDATION", "score must be between 0 and outOf");

      const allowed = await canStaffManageModuleResults(user, moduleId);
      if (!allowed) return err(res, 403, "FORBIDDEN", "Lecturer cannot manage this module marksheet");

      const enrolled = await assertModuleStudentEnrollment(moduleId, studentId);
      if (!enrolled) return err(res, 400, "VALIDATION", "Student is not enrolled in this module");

      const saved = await upsertAssessmentResultForStudent({
        studentId,
        subject,
        score,
        outOf,
        date,
        moduleId,
      });

      await createResultNotifications({
        resultId: saved.id,
        studentId,
        subject: saved.subject,
        score: saved.score,
        outOf: saved.outOf,
        date: saved.date,
        action: "UPDATED",
      }).catch((notificationError) => {
        console.error("[parent] single marksheet notification failed", notificationError);
      });

      return res.json(saved);
    } catch (e: any) {
      console.error("[parent] POST /admin/results/module/:moduleId/students/:studentId error", e);
      return err(res, 500, "INTERNAL", "Failed to save learner result");
    }
  }
);

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
parentRouter.get("/finance", requireRole("PARENT"), async (req, res) => {
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

    const [summary, tx, financeDocuments, financeNotifications] = await Promise.all([
      repos.finance.getSummary(studentId),
      repos.finance.listTransactions(studentId, { limit: 50 }),
      repos.finance.listDocuments(studentId, { limit: 25 }),
      repos.finance.listNotifications(studentId, { limit: 25 }),
    ]);

    // Heuristic: last payment is typically a negative amount (money received)
    const lastPayment = tx.find((t) => t.amountCents < 0) ?? null;

    const balance = summary.balanceCents / 100;
    const status = summary.accountStatus;

    const notifications =
      financeNotifications.length > 0
        ? financeNotifications.map((entry) => ({
            id: entry.id,
            title: entry.title,
            body: entry.body,
            severity: entry.severity.toLowerCase(),
            createdAt: entry.createdAt,
          }))
        : status === "OVERDUE"
          ? [
              {
                id: "overdue",
                title: "Account overdue",
                body: `Outstanding balance: R ${balance.toFixed(2)}`,
                severity: "warning",
              },
            ]
          : [{ id: "ok", title: "Account up to date", body: "No outstanding balance.", severity: "info" }];

    const statementsCount =
      financeDocuments.filter((entry) => entry.type === "STATEMENT").length +
      tx.filter((t) => /statement/i.test(t.description)).length;

    const documents = [
      ...financeDocuments.map((entry) => ({
        id: entry.id,
        kind: entry.type,
        type: entry.type,
        title: entry.title,
        amount: entry.amountCents == null ? 0 : entry.amountCents / 100,
        occurredAt: entry.issuedAt,
        description: entry.description ?? null,
        documentUrl: entry.documentUrl ?? null,
      })),
      ...tx.slice(0, 12).map((t) => {
        const kind = /statement/i.test(t.description) ? "STATEMENT" : "TRANSACTION";
        return {
          id: t.id,
          kind,
          type: kind,
          title: kind === "STATEMENT" ? "Statement transaction" : "Finance transaction",
          amount: t.amountCents / 100,
          occurredAt: t.occurredAt,
          description: t.description ?? null,
          documentUrl: null,
        };
      }),
    ]
      .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
      .slice(0, 20);

    return res.json({
      balance,
      statements: statementsCount,
      lastPayment: lastPayment?.occurredAt ?? null,
      status,
      statusNote: summary.statusNote,
      currency: summary.currency,
      documents,
      notifications,
    });
  } catch (e: any) {
    console.error("[parent] GET /finance error", e);
    return err(res, 500, "INTERNAL", "Failed to load finance");
  }
});

/**
 * -------------------------
 * FINANCE STATEMENT DOWNLOAD
 * -------------------------
 * GET /api/parent/finance/statement?childId=STU-1001
 */
parentRouter.get("/finance/statement", requireRole("PARENT"), async (req, res) => {
  try {
    const parentId = req.user!.id;
    const childId = String(req.query.childId ?? "").trim();
    if (!childId) return err(res, 400, "VALIDATION", "childId query param is required");

    const studentId = await resolveStudentUserId(childId);
    if (!studentId) return err(res, 404, "NOT_FOUND", "Student not found");

    const linked = await parentHasApprovedLink(parentId, studentId);
    if (!linked) return err(res, 403, "FORBIDDEN", "Parent is not linked to this student");

    await repos.finance.ensureAccount(studentId);
    const summary = await repos.finance.getSummary(studentId);
    const tx = await repos.finance.listTransactions(studentId, { limit: 500 });

    const generatedAt = new Date().toISOString();
    const dateStamp = generatedAt.slice(0, 10);
    const safeChildId = childId.replace(/[^a-z0-9._-]+/gi, "_");

    const lines: string[] = [
      `Generated At,${csvCell(generatedAt)}`,
      `Child,${csvCell(childId)}`,
      `Currency,${csvCell(summary.currency)}`,
      `Balance,${csvCell((summary.balanceCents / 100).toFixed(2))}`,
      "",
      "Occurred At,Description,Amount",
    ];

    if (tx.length === 0) {
      lines.push("No transactions,,");
    } else {
      for (const t of tx) {
        lines.push(
          `${csvCell(t.occurredAt)},${csvCell(t.description ?? "")},${csvCell((t.amountCents / 100).toFixed(2))}`
        );
      }
    }

    const csv = `\uFEFF${lines.join("\n")}\n`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="finance-statement-${safeChildId || "child"}-${dateStamp}.csv"`
    );

    return res.status(200).send(csv);
  } catch (e: any) {
    console.error("[parent] GET /finance/statement error", e);
    return err(res, 500, "INTERNAL", "Failed to download finance statement");
  }
});
