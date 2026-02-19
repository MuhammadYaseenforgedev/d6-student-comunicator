import { apiGet, apiPost } from "../lib/api";

export type ParentChild = {
  id: string;
  email: string;
  role: "STUDENT";
  publicStudentId?: string | null;
};

export type ParentPortalInfo = {
  ok: boolean;
  role: string;
  message: string;
};

export type LinkRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | string;

export type LinkRequest = {
  id: string;
  childId: string;
  status: LinkRequestStatus;
  requestedAt: string;
};

export type LinkRequestCreateResult = {
  id: string;
  childId: string;
  status: LinkRequestStatus;
  requestedAt: string;
};

export type Result = {
  id: string;
  subject: string;
  score: number;
  outOf: number;
  date: string;
};

export type FinanceNotification = {
  id: string;
  title: string;
  body: string;
  severity: string;
};

export type FinanceDocument = {
  id: string;
  kind: string;
  type: string;
  amount: number;
  occurredAt: string;
  description: string | null;
};

export type FinanceSummary = {
  balance: number;
  statements: number;
  lastPayment: string | null;
  status: string;
  notifications: FinanceNotification[];
  documents: FinanceDocument[];
};

const DEFAULT_FINANCE: FinanceSummary = {
  balance: 0,
  statements: 0,
  lastPayment: null,
  status: "OK",
  notifications: [],
  documents: [],
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toStringValue(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function toNumberValue(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (isObject(data) && Array.isArray(data.value)) return data.value as T[];
  return [];
}

function normalizeChild(row: unknown): ParentChild | null {
  if (!isObject(row)) return null;

  const id = toStringValue(row.id).trim();
  const email = toStringValue(row.email).trim();
  if (!id || !email) return null;

  const roleRaw = toStringValue(row.role, "STUDENT").toUpperCase();
  const role: "STUDENT" = roleRaw === "STUDENT" ? "STUDENT" : "STUDENT";

  let publicStudentId: string | null | undefined = undefined;
  const ps = row.publicStudentId;
  if (typeof ps === "string") publicStudentId = ps.trim() || null;
  if (ps === null) publicStudentId = null;

  return { id, email, role, publicStudentId };
}

function normalizeLinkRequest(row: unknown): LinkRequest | null {
  if (!isObject(row)) return null;

  const id = toStringValue(row.id).trim();
  if (!id) return null;

  const childIdRaw = toStringValue(row.childId).trim();
  const childId = childIdRaw || "unknown";
  const status = toStringValue(row.status, "PENDING").toUpperCase();
  const requestedAt = toStringValue(row.requestedAt) || new Date().toISOString();

  return { id, childId, status, requestedAt };
}

function normalizeResult(row: unknown, index: number): Result {
  if (!isObject(row)) {
    return {
      id: `result-${index}`,
      subject: "Unknown",
      score: 0,
      outOf: 100,
      date: "",
    };
  }

  const id = toStringValue(row.id) || `result-${index}`;
  const subject = toStringValue(row.subject, "Unknown");
  const score = toNumberValue(row.score, 0);
  const outOf = toNumberValue(row.outOf, 100);
  const date = toStringValue(row.date, "");

  return { id, subject, score, outOf, date };
}

function normalizeFinanceNotification(row: unknown, index: number): FinanceNotification | null {
  if (!isObject(row)) return null;

  const id = toStringValue(row.id).trim() || `notification-${index}`;
  const title = toStringValue(row.title, "");
  const body = toStringValue(row.body, "");
  const severity = toStringValue(row.severity, "info");

  return { id, title, body, severity };
}

function normalizeFinanceDocument(row: unknown, index: number): FinanceDocument | null {
  if (!isObject(row)) return null;

  const id = toStringValue(row.id).trim() || `document-${index}`;
  const kind = toStringValue(row.kind, "TRANSACTION");
  const type = toStringValue(row.type, kind || "TRANSACTION");
  const amount = toNumberValue(row.amount, 0);
  const occurredAt = toStringValue(row.occurredAt, "");
  const descriptionRaw = row.description;
  const description = typeof descriptionRaw === "string" ? descriptionRaw : null;

  return { id, kind, type, amount, occurredAt, description };
}

function normalizeFinanceSummary(data: unknown): FinanceSummary {
  if (!isObject(data)) return { ...DEFAULT_FINANCE };

  const notificationsRaw = Array.isArray(data.notifications) ? data.notifications : [];
  const documentsRaw = Array.isArray(data.documents) ? data.documents : [];

  return {
    balance: toNumberValue(data.balance, DEFAULT_FINANCE.balance),
    statements: toNumberValue(data.statements, DEFAULT_FINANCE.statements),
    lastPayment: typeof data.lastPayment === "string" ? data.lastPayment : null,
    status: toStringValue(data.status, DEFAULT_FINANCE.status),
    notifications: notificationsRaw
      .map((n, i) => normalizeFinanceNotification(n, i))
      .filter((n): n is FinanceNotification => n !== null),
    documents: documentsRaw
      .map((d, i) => normalizeFinanceDocument(d, i))
      .filter((d): d is FinanceDocument => d !== null),
  };
}

export async function parentPortalCheck(): Promise<ParentPortalInfo> {
  const data = await apiGet<unknown>("/api/parent/parent");
  if (!isObject(data)) {
    return { ok: false, role: "PARENT", message: "Parent portal unavailable" };
  }

  return {
    ok: Boolean(data.ok),
    role: toStringValue(data.role, "PARENT"),
    message: toStringValue(data.message, ""),
  };
}

export async function listMyChildren(): Promise<ParentChild[]> {
  const data = await apiGet<unknown>("/api/parent/parent/children");
  return unwrapList<unknown>(data)
    .map(normalizeChild)
    .filter((x): x is ParentChild => x !== null);
}

export async function listLinkRequests(): Promise<LinkRequest[]> {
  const data = await apiGet<unknown>("/api/parent/parent/link-requests");
  return unwrapList<unknown>(data)
    .map(normalizeLinkRequest)
    .filter((x): x is LinkRequest => x !== null);
}

export async function createLinkRequest(childId: string): Promise<LinkRequestCreateResult> {
  const data = await apiPost<unknown>("/api/parent/parent/link-requests", { childId });

  if (!isObject(data)) {
    return {
      id: "unknown",
      childId,
      status: "PENDING",
      requestedAt: new Date().toISOString(),
    };
  }

  return {
    id: toStringValue(data.id, "unknown"),
    childId: toStringValue(data.childId, childId),
    status: toStringValue(data.status, "PENDING").toUpperCase(),
    requestedAt: toStringValue(data.requestedAt, new Date().toISOString()),
  };
}

export async function getResults(childId: string): Promise<Result[]> {
  const data = await apiGet<unknown>(`/api/parent/parent/results?childId=${encodeURIComponent(childId)}`);
  return unwrapList<unknown>(data).map((row, index) => normalizeResult(row, index));
}

export async function getFinance(childId: string): Promise<FinanceSummary> {
  const data = await apiGet<unknown>(`/api/parent/parent/finance?childId=${encodeURIComponent(childId)}`);
  return normalizeFinanceSummary(data);
}
