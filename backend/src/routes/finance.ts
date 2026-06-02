import { Router, type Request, type Response } from "express";
import { pool } from "../config/db";
import { requireAccess } from "../middleware/rbac";
import { repos } from "../persistence";
import type { FinanceDocument, FinanceStatusNotification, FinanceSummary, FinanceTransaction } from "../persistence/types";
import { pgFinanceRepo } from "../repos/pgFinanceRepo";
import { hasAdminScope } from "../lib/adminAccess";

type AuthedRequest = Request & {
  user?: { id: string; role: string; adminScope?: string | null };
};

type StudentRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  course_name: string | null;
  public_student_id: string | null;
};

type ParentRow = {
  id: string;
  email: string;
};

type FinanceListRow = {
  student_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  course_name: string | null;
  public_student_id: string | null;
  balance_cents: number | null;
  currency: string | null;
  account_status: string | null;
  status_note: string | null;
  updated_at: string | null;
  parents: unknown;
};

const ACCOUNT_STATUSES = ["OK", "OUTSTANDING", "OVERDUE", "PAYMENT_PLAN", "HOLD"] as const;
const DOCUMENT_TYPES = ["STATEMENT", "INVOICE", "NOTICE", "RECEIPT", "PAYMENT_PLAN"] as const;
const NOTIFICATION_SEVERITIES = ["INFO", "SUCCESS", "WARNING", "URGENT"] as const;

function err(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function parseLimit(raw: unknown, fallback = 50, max = 100) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function csvCell(v: string | number | null | undefined): string {
  const raw = v == null ? "" : String(v);
  if (!/[",\n\r]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function userDisplayName(student: {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  public_student_id?: string | null;
}): string {
  const first = String(student.first_name ?? "").trim();
  const last = String(student.last_name ?? "").trim();
  const fullName = `${first} ${last}`.trim();
  return fullName || String(student.public_student_id ?? "").trim() || student.email;
}

function studentLabel(student: StudentRow): string {
  return String(student.public_student_id ?? "").trim() || student.email;
}

function parseMoneyInput(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function normalizeTimestamp(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizeStatus(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toUpperCase();
  return ACCOUNT_STATUSES.includes(value as (typeof ACCOUNT_STATUSES)[number]) ? value : null;
}

function normalizeDocumentType(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toUpperCase();
  return DOCUMENT_TYPES.includes(value as (typeof DOCUMENT_TYPES)[number]) ? value : null;
}

function normalizeSeverity(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toUpperCase();
  return NOTIFICATION_SEVERITIES.includes(value as (typeof NOTIFICATION_SEVERITIES)[number]) ? value : null;
}

function normalizeParents(raw: unknown): ParentRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ParentRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const email = String(row.email ?? "").trim();
    if (!id || !email) continue;
    out.push({ id, email });
  }
  return out;
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

async function loadStudent(studentId: string): Promise<StudentRow | null> {
  const result = await pool.query<StudentRow>(
    `
      SELECT id, email, first_name, last_name, course_name, public_student_id
      FROM users
      WHERE id = $1
        AND role = 'STUDENT'
      LIMIT 1
    `,
    [studentId]
  );
  return result.rows[0] ?? null;
}

async function loadLinkedParents(studentId: string): Promise<ParentRow[]> {
  const result = await pool.query<ParentRow>(
    `
      SELECT p.id, p.email
      FROM parent_links pl
      JOIN users p ON p.id = pl.parent_user_id
      WHERE pl.student_user_id = $1
      ORDER BY lower(p.email) ASC
    `,
    [studentId]
  );
  return result.rows;
}

function buildFinanceOverview(
  summary: FinanceSummary,
  transactions: FinanceTransaction[],
  documents: FinanceDocument[],
  notifications: FinanceStatusNotification[]
) {
  const lastPayment = transactions.find((entry) => entry.amountCents < 0) ?? null;
  const transactionDocuments = transactions.slice(0, 12).map((entry) => ({
    id: entry.id,
    type: /statement/i.test(entry.description) ? "STATEMENT" : "TRANSACTION",
    title: /statement/i.test(entry.description) ? "Statement transaction" : "Finance transaction",
    description: entry.description,
    amount: entry.amountCents / 100,
    occurredAt: entry.occurredAt,
    documentUrl: null,
  }));
  const adminDocuments = documents.map((entry) => ({
    id: entry.id,
    type: entry.type,
    title: entry.title,
    description: entry.description,
    amount: entry.amountCents == null ? 0 : entry.amountCents / 100,
    occurredAt: entry.issuedAt,
    documentUrl: entry.documentUrl,
  }));

  return {
    balance: summary.balanceCents / 100,
    currency: summary.currency,
    status: summary.accountStatus,
    statusNote: summary.statusNote,
    statements:
      documents.filter((entry) => entry.type === "STATEMENT").length +
      transactions.filter((entry) => /statement/i.test(entry.description)).length,
    lastPayment: lastPayment?.occurredAt ?? null,
    notifications: notifications.map((entry) => ({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      severity: entry.severity,
      createdAt: entry.createdAt,
    })),
    documents: [...adminDocuments, ...transactionDocuments]
      .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
      .slice(0, 20),
  };
}

async function loadFinanceAccountDetail(studentId: string) {
  const student = await loadStudent(studentId);
  if (!student) return null;

  const [parents, summary, transactions, documents, notifications] = await Promise.all([
    loadLinkedParents(studentId),
    pgFinanceRepo.getSummary(studentId),
    pgFinanceRepo.listTransactions(studentId, { limit: 100 }),
    pgFinanceRepo.listDocuments(studentId, { limit: 50 }),
    pgFinanceRepo.listNotifications(studentId, { limit: 50 }),
  ]);

  return {
    student: {
      id: student.id,
      email: student.email,
      firstName: student.first_name,
      lastName: student.last_name,
      courseName: student.course_name,
      studentNumber: student.public_student_id,
      parents,
    },
    summary: buildFinanceOverview(summary, transactions, documents, notifications),
    transactions: transactions.map((entry) => ({
      id: entry.id,
      amount: entry.amountCents / 100,
      currency: entry.currency,
      description: entry.description,
      occurredAt: entry.occurredAt,
      createdAt: entry.createdAt,
    })),
    documents: documents.map((entry) => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      description: entry.description,
      amount: entry.amountCents == null ? null : entry.amountCents / 100,
      currency: entry.currency,
      issuedAt: entry.issuedAt,
      documentUrl: entry.documentUrl,
      createdAt: entry.createdAt,
    })),
    notifications: notifications.map((entry) => ({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      severity: entry.severity,
      createdAt: entry.createdAt,
    })),
  };
}

async function fanOutParentFinanceNotification(input: {
  student: StudentRow;
  title: string;
  body: string;
  sourceKey: string;
}) {
  const parents = await loadLinkedParents(input.student.id);
  if (parents.length === 0) return;

  const childId = studentLabel(input.student);
  await repos.notifications.createMany(
    parents.map((parent) => ({
      userId: parent.id,
      category: "FINANCE",
      type: "FINANCE_UPDATE",
      title: input.title,
      body: input.body,
      meta: {
        href: "/app/parent/finance",
        studentId: input.student.id,
        childId,
      },
      sourceKey: input.sourceKey,
    }))
  );
}

function buildFinanceStatementCsv(input: {
  student: StudentRow;
  summary: FinanceSummary;
  transactions: FinanceTransaction[];
  documents: FinanceDocument[];
}) {
  const generatedAt = new Date().toISOString();
  const lines: string[] = [
    `Generated At,${csvCell(generatedAt)}`,
    `Student,${csvCell(studentLabel(input.student))}`,
    `Student Email,${csvCell(input.student.email)}`,
    `Currency,${csvCell(input.summary.currency)}`,
    `Balance,${csvCell((input.summary.balanceCents / 100).toFixed(2))}`,
    `Status,${csvCell(input.summary.accountStatus)}`,
    `Status Note,${csvCell(input.summary.statusNote ?? "")}`,
    "",
    "Transactions",
    "Occurred At,Description,Amount",
  ];

  if (input.transactions.length === 0) {
    lines.push("No transactions,,");
  } else {
    for (const entry of input.transactions) {
      lines.push(
        `${csvCell(entry.occurredAt)},${csvCell(entry.description)},${csvCell((entry.amountCents / 100).toFixed(2))}`
      );
    }
  }

  lines.push("", "Documents", "Issued At,Type,Title,Description,Amount");

  if (input.documents.length === 0) {
    lines.push("No documents,,,,");
  } else {
    for (const entry of input.documents) {
      lines.push(
        [
          csvCell(entry.issuedAt),
          csvCell(entry.type),
          csvCell(entry.title),
          csvCell(entry.description ?? ""),
          csvCell(entry.amountCents == null ? "" : (entry.amountCents / 100).toFixed(2)),
        ].join(",")
      );
    }
  }

  return `\uFEFF${lines.join("\n")}\n`;
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
      if (!hasAdminScope(user, ["FINANCE", "SUPER"])) {
        return err(res, 403, "FORBIDDEN", "Only finance admins can access admin finance data");
      }
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
      if (!hasAdminScope(user, ["FINANCE", "SUPER"])) {
        return err(res, 403, "FORBIDDEN", "Only finance admins can access admin finance data");
      }
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

financeRouter.get(
  "/finance/admin/accounts",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["FINANCE", "SUPER"] }),
  async (req: AuthedRequest, res: Response) => {
  try {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const limit = parseLimit(req.query.limit, 100, 250);
    const params: unknown[] = [];
    const where = [`u.role = 'STUDENT'`];

    if (q) {
      params.push(`%${q}%`);
      where.push(`(
        lower(u.email) LIKE $${params.length}
        OR lower(COALESCE(u.first_name, '')) LIKE $${params.length}
        OR lower(COALESCE(u.last_name, '')) LIKE $${params.length}
        OR lower(COALESCE(u.course_name, '')) LIKE $${params.length}
        OR lower(COALESCE(u.public_student_id, '')) LIKE $${params.length}
        OR EXISTS (
          SELECT 1
          FROM parent_links pl2
          JOIN users p2 ON p2.id = pl2.parent_user_id
          WHERE pl2.student_user_id = u.id
            AND lower(p2.email) LIKE $${params.length}
        )
      )`);
    }

    params.push(limit);

    const result = await pool.query<FinanceListRow>(
      `
        SELECT
          u.id AS student_id,
          u.email,
          u.first_name,
          u.last_name,
          u.course_name,
          u.public_student_id,
          fa.balance_cents,
          fa.currency,
          fa.account_status,
          fa.status_note,
          fa.updated_at,
          COALESCE(
            jsonb_agg(DISTINCT jsonb_build_object('id', p.id, 'email', p.email))
              FILTER (WHERE p.id IS NOT NULL),
            '[]'::jsonb
          ) AS parents
        FROM users u
        LEFT JOIN finance_accounts fa ON fa.user_id = u.id
        LEFT JOIN parent_links pl ON pl.student_user_id = u.id
        LEFT JOIN users p ON p.id = pl.parent_user_id
        WHERE ${where.join(" AND ")}
        GROUP BY
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.course_name,
          u.public_student_id,
          fa.balance_cents,
          fa.currency,
          fa.account_status,
          fa.status_note,
          fa.updated_at
        ORDER BY lower(COALESCE(u.public_student_id, u.email)) ASC
        LIMIT $${params.length}
      `,
      params
    );

    return res.json({
      value: result.rows.map((row) => ({
        studentId: row.student_id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        courseName: row.course_name,
        studentNumber: row.public_student_id,
        balance: Number(row.balance_cents ?? 0) / 100,
        currency: row.currency ?? "ZAR",
        status: row.account_status ?? (Number(row.balance_cents ?? 0) > 0 ? "OVERDUE" : "OK"),
        statusNote: row.status_note,
        updatedAt: row.updated_at,
        parents: normalizeParents(row.parents),
      })),
      count: result.rows.length,
    });
  } catch (e: unknown) {
    console.error("[finance] GET /finance/admin/accounts error", e);
    return err(res, 500, "INTERNAL", "Failed to load finance accounts");
  }
  }
);

financeRouter.get(
  "/finance/admin/accounts/:studentId",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["FINANCE", "SUPER"] }),
  async (req: AuthedRequest, res: Response) => {
  try {
    const studentId = String(req.params.studentId ?? "").trim();
    if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

    const detail = await loadFinanceAccountDetail(studentId);
    if (!detail) return err(res, 404, "NOT_FOUND", "Student finance account not found");
    return res.json(detail);
  } catch (e: unknown) {
    console.error("[finance] GET /finance/admin/accounts/:studentId error", e);
    return err(res, 500, "INTERNAL", "Failed to load finance account detail");
  }
  }
);

financeRouter.patch(
  "/finance/admin/accounts/:studentId",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["FINANCE", "SUPER"] }),
  async (req: AuthedRequest, res: Response) => {
  try {
    const studentId = String(req.params.studentId ?? "").trim();
    if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

    if (!(await loadStudent(studentId))) return err(res, 404, "NOT_FOUND", "Student not found");

    const balanceCents = Object.prototype.hasOwnProperty.call(req.body ?? {}, "balance")
      ? parseMoneyInput(req.body?.balance)
      : undefined;
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "balance") && balanceCents == null) {
      return err(res, 400, "VALIDATION", "balance must be a number");
    }

    const currencyRaw = Object.prototype.hasOwnProperty.call(req.body ?? {}, "currency")
      ? String(req.body?.currency ?? "").trim().toUpperCase()
      : undefined;
    if (currencyRaw !== undefined && !currencyRaw) {
      return err(res, 400, "VALIDATION", "currency cannot be empty");
    }

    const statusRaw = Object.prototype.hasOwnProperty.call(req.body ?? {}, "status")
      ? normalizeStatus(req.body?.status)
      : undefined;
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "status") && !statusRaw) {
      return err(res, 400, "VALIDATION", "status is invalid");
    }

    const hasStatusNote = Object.prototype.hasOwnProperty.call(req.body ?? {}, "statusNote");
    const statusNote =
      hasStatusNote && typeof req.body?.statusNote === "string"
        ? req.body.statusNote
        : hasStatusNote && req.body?.statusNote == null
          ? null
          : hasStatusNote
            ? ""
            : undefined;
    if (hasStatusNote && statusNote === "") {
      return err(res, 400, "VALIDATION", "statusNote must be text or null");
    }

    if (
      balanceCents === undefined &&
      currencyRaw === undefined &&
      statusRaw === undefined &&
      statusNote === undefined
    ) {
      return err(res, 400, "VALIDATION", "At least one editable finance field is required");
    }

    await pgFinanceRepo.updateAccount(studentId, {
      balanceCents: balanceCents ?? undefined,
      currency: currencyRaw,
      accountStatus: statusRaw ?? undefined,
      statusNote,
    });

    const detail = await loadFinanceAccountDetail(studentId);
    if (!detail) return err(res, 404, "NOT_FOUND", "Student finance account not found");
    return res.json(detail);
  } catch (e: unknown) {
    console.error("[finance] PATCH /finance/admin/accounts/:studentId error", e);
    return err(res, 500, "INTERNAL", "Failed to update finance account");
  }
  }
);

financeRouter.post(
  "/finance/admin/accounts/:studentId/transactions",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["FINANCE", "SUPER"] }),
  async (req: AuthedRequest, res: Response) => {
    try {
      const studentId = String(req.params.studentId ?? "").trim();
      if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

      if (!(await loadStudent(studentId))) return err(res, 404, "NOT_FOUND", "Student not found");

      const amountCents = parseMoneyInput(req.body?.amount);
      if (amountCents == null || amountCents === 0) {
        return err(res, 400, "VALIDATION", "amount must be a non-zero number");
      }

      const description = String(req.body?.description ?? "").trim();
      if (!description) return err(res, 400, "VALIDATION", "description is required");

      const occurredAt =
        req.body?.occurredAt === undefined || req.body?.occurredAt === null || req.body?.occurredAt === ""
          ? undefined
          : normalizeTimestamp(req.body?.occurredAt);
      if (req.body?.occurredAt && !occurredAt) {
        return err(res, 400, "VALIDATION", "occurredAt must be a valid ISO date");
      }

      const currency = String(req.body?.currency ?? "ZAR").trim().toUpperCase() || "ZAR";
      const transaction = await pgFinanceRepo.createTransaction(studentId, {
        amountCents,
        currency,
        description,
        occurredAt: occurredAt ?? undefined,
      });

      const detail = await loadFinanceAccountDetail(studentId);
      return res.status(201).json({
        ok: true,
        transaction: {
          id: transaction.id,
          amount: transaction.amountCents / 100,
          currency: transaction.currency,
          description: transaction.description,
          occurredAt: transaction.occurredAt,
          createdAt: transaction.createdAt,
        },
        detail,
      });
    } catch (e: unknown) {
      console.error("[finance] POST /finance/admin/accounts/:studentId/transactions error", e);
      return err(res, 500, "INTERNAL", "Failed to add finance transaction");
    }
  }
);

financeRouter.post(
  "/finance/admin/accounts/:studentId/documents",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["FINANCE", "SUPER"] }),
  async (req: AuthedRequest, res: Response) => {
    try {
      const studentId = String(req.params.studentId ?? "").trim();
      if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

      const student = await loadStudent(studentId);
      if (!student) return err(res, 404, "NOT_FOUND", "Student not found");

      const type = normalizeDocumentType(req.body?.type);
      if (!type) return err(res, 400, "VALIDATION", "type is invalid");

      const title = String(req.body?.title ?? "").trim();
      if (!title) return err(res, 400, "VALIDATION", "title is required");

      const description = String(req.body?.description ?? "").trim() || null;
      const amountCents =
        req.body?.amount === undefined || req.body?.amount === null || req.body?.amount === ""
          ? null
          : parseMoneyInput(req.body?.amount);
      if (req.body?.amount !== undefined && req.body?.amount !== null && req.body?.amount !== "" && amountCents == null) {
        return err(res, 400, "VALIDATION", "amount must be a number");
      }

      const issuedAt =
        req.body?.issuedAt === undefined || req.body?.issuedAt === null || req.body?.issuedAt === ""
          ? undefined
          : normalizeTimestamp(req.body?.issuedAt);
      if (req.body?.issuedAt && !issuedAt) {
        return err(res, 400, "VALIDATION", "issuedAt must be a valid ISO date");
      }

      const currency = String(req.body?.currency ?? "ZAR").trim().toUpperCase() || "ZAR";
      const documentUrl = String(req.body?.documentUrl ?? "").trim() || null;
      const createdBy = String(req.user?.id ?? "").trim() || null;

      const document = await pgFinanceRepo.createDocument(studentId, {
        type,
        title,
        description,
        amountCents,
        currency,
        issuedAt: issuedAt ?? undefined,
        documentUrl,
        createdBy,
      });

      await fanOutParentFinanceNotification({
        student,
        title: `New ${type.toLowerCase().replace(/_/g, " ")} available`,
        body: `${title} is now available in the finance portal for ${userDisplayName(student)}.`,
        sourceKey: `finance-document:${document.id}`,
      });

      const detail = await loadFinanceAccountDetail(studentId);
      return res.status(201).json({
        ok: true,
        document: {
          id: document.id,
          type: document.type,
          title: document.title,
          description: document.description,
          amount: document.amountCents == null ? null : document.amountCents / 100,
          currency: document.currency,
          issuedAt: document.issuedAt,
          documentUrl: document.documentUrl,
          createdAt: document.createdAt,
        },
        detail,
      });
    } catch (e: unknown) {
      console.error("[finance] POST /finance/admin/accounts/:studentId/documents error", e);
      return err(res, 500, "INTERNAL", "Failed to add finance document");
    }
  }
);

financeRouter.post(
  "/finance/admin/accounts/:studentId/notifications",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["FINANCE", "SUPER"] }),
  async (req: AuthedRequest, res: Response) => {
    try {
      const studentId = String(req.params.studentId ?? "").trim();
      if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

      const student = await loadStudent(studentId);
      if (!student) return err(res, 404, "NOT_FOUND", "Student not found");

      const title = String(req.body?.title ?? "").trim();
      const body = String(req.body?.body ?? "").trim();
      const severity = normalizeSeverity(req.body?.severity);
      if (!title) return err(res, 400, "VALIDATION", "title is required");
      if (!body) return err(res, 400, "VALIDATION", "body is required");
      if (!severity) return err(res, 400, "VALIDATION", "severity is invalid");

      const notification = await pgFinanceRepo.createNotification(studentId, {
        title,
        body,
        severity,
        createdBy: String(req.user?.id ?? "").trim() || null,
      });

      await fanOutParentFinanceNotification({
        student,
        title,
        body,
        sourceKey: `finance-note:${notification.id}`,
      });

      const detail = await loadFinanceAccountDetail(studentId);
      return res.status(201).json({
        ok: true,
        notification: {
          id: notification.id,
          title: notification.title,
          body: notification.body,
          severity: notification.severity,
          createdAt: notification.createdAt,
        },
        detail,
      });
    } catch (e: unknown) {
      console.error("[finance] POST /finance/admin/accounts/:studentId/notifications error", e);
      return err(res, 500, "INTERNAL", "Failed to add finance notification");
    }
  }
);

financeRouter.get(
  "/finance/admin/accounts/:studentId/statement",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["FINANCE", "SUPER"] }),
  async (req: AuthedRequest, res: Response) => {
    try {
      const studentId = String(req.params.studentId ?? "").trim();
      if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

      const student = await loadStudent(studentId);
      if (!student) return err(res, 404, "NOT_FOUND", "Student not found");

      const [summary, transactions, documents] = await Promise.all([
        pgFinanceRepo.getSummary(studentId),
        pgFinanceRepo.listTransactions(studentId, { limit: 500 }),
        pgFinanceRepo.listDocuments(studentId, { limit: 200 }),
      ]);

      const csv = buildFinanceStatementCsv({ student, summary, transactions, documents });
      const safeChildId = studentLabel(student).replace(/[^a-z0-9._-]+/gi, "_");
      const dateStamp = new Date().toISOString().slice(0, 10);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="finance-admin-statement-${safeChildId || "student"}-${dateStamp}.csv"`
      );

      return res.status(200).send(csv);
    } catch (e: unknown) {
      console.error("[finance] GET /finance/admin/accounts/:studentId/statement error", e);
      return err(res, 500, "INTERNAL", "Failed to download finance statement");
    }
  }
);
