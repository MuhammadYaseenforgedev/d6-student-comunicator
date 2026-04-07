import { apiDelete, apiDownload, apiGet, apiPost } from "../lib/api";
import { getUser } from "../lib/auth";
import { isMockDataEnabled } from "../lib/devMode";

export type ParentChild = {
  id: string;
  email: string;
  role: "STUDENT";
  publicStudentId?: string | null;
  studentNumber?: string | null;
  userId?: string;
  childUserId?: string;
  studentUserId?: string;
};

export type LinkChildResult = {
  created: boolean;
  pending?: boolean;
  message?: string;
  child?: ParentChild;
  childId?: string;
  southAfricanId?: string | null;
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
  southAfricanId?: string | null;
  status: LinkRequestStatus;
  requestedAt: string;
};

export type AdminLinkRequestStatusFilter = "PENDING" | "APPROVED" | "REJECTED" | "ALL";
export type AdminLinkRequestDecision = "APPROVED" | "REJECTED";

export type AdminLinkRequest = {
  id: string;
  status: LinkRequestStatus;
  requestedAt: string;
  decidedAt: string | null;
  parentUserId: string;
  parentEmail: string;
  childUserId: string;
  childEmail: string;
  childId: string;
  southAfricanId?: string | null;
  decidedById: string | null;
  decidedByEmail: string | null;
};

export type LinkRequestCreateResult = {
  id: string;
  childId: string;
  southAfricanId?: string | null;
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

export type StaffResultInput = {
  childId: string;
  subject: string;
  score: number;
  outOf?: number;
  date?: string;
};

export type StaffResultUpdateInput = {
  subject?: string;
  score?: number;
  outOf?: number;
  date?: string;
};

export type FinanceNotification = {
  id: string;
  title: string;
  body: string;
  severity: string;
  createdAt?: string | null;
};

export type FinanceDocument = {
  id: string;
  kind: string;
  type: string;
  title?: string;
  amount: number;
  occurredAt: string;
  description: string | null;
  documentUrl?: string | null;
};

export type FinanceSummary = {
  balance: number;
  currency?: string;
  statements: number;
  lastPayment: string | null;
  status: string;
  statusNote?: string | null;
  notifications: FinanceNotification[];
  documents: FinanceDocument[];
};

export type ParentAttendanceRecord = {
  sessionId: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  facultyName: string;
  status: string;
  markedAt: string;
};

const DEFAULT_FINANCE: FinanceSummary = {
  balance: 0,
  statements: 0,
  lastPayment: null,
  status: "OK",
  notifications: [],
  documents: [],
};

const MOCK_LINK_REQUESTS_KEY = "d6_mock_parent_link_requests_v1";

const MOCK_CHILD: ParentChild = {
  id: "mock-student-1",
  email: "student@localhost.test",
  role: "STUDENT",
  publicStudentId: "STU-1001",
  studentNumber: "STU-1001",
  userId: "mock-student-1",
  childUserId: "mock-student-1",
  studentUserId: "mock-student-1",
};

const MOCK_RESULTS: Result[] = [
  { id: "result-1", subject: "Mathematics", score: 82, outOf: 100, date: "2026-03-12" },
  { id: "result-2", subject: "Programming", score: 91, outOf: 100, date: "2026-03-20" },
  { id: "result-3", subject: "Communication Skills", score: 76, outOf: 100, date: "2026-03-24" },
];

const MOCK_FINANCE: FinanceSummary = {
  balance: 2450.5,
  currency: "ZAR",
  statements: 3,
  lastPayment: "2026-03-25T09:30:00.000Z",
  status: "OUTSTANDING",
  statusNote: "Payment due before the April registration cut-off.",
  notifications: [
    {
      id: "finance-note-1",
      title: "April statement ready",
      body: "Your latest statement is available for download.",
      severity: "info",
      createdAt: "2026-03-26T10:00:00.000Z",
    },
  ],
  documents: [
    {
      id: "finance-doc-1",
      kind: "STATEMENT",
      type: "STATEMENT",
      title: "Statement - March 2026",
      amount: 2450.5,
      occurredAt: "2026-03-26T08:00:00.000Z",
      description: "Tuition and campus services statement.",
      documentUrl: null,
    },
  ],
};

const MOCK_ATTENDANCE: ParentAttendanceRecord[] = [
  {
    sessionId: "attendance-1",
    date: "2026-03-25",
    startsAt: "2026-03-25T08:00:00.000Z",
    endsAt: "2026-03-25T10:00:00.000Z",
    moduleId: "module-prog-1",
    moduleCode: "PRG101",
    moduleName: "Programming Fundamentals",
    facultyName: "Computing",
    status: "PRESENT",
    markedAt: "2026-03-25T08:05:00.000Z",
  },
  {
    sessionId: "attendance-2",
    date: "2026-03-27",
    startsAt: "2026-03-27T11:00:00.000Z",
    endsAt: "2026-03-27T13:00:00.000Z",
    moduleId: "module-math-1",
    moduleCode: "MAT101",
    moduleName: "Mathematics",
    facultyName: "Computing",
    status: "LATE",
    markedAt: "2026-03-27T11:12:00.000Z",
  },
];

function getMockParentEmail(): string {
  return (getUser()?.email ?? "parent@localhost.test").trim().toLowerCase();
}

function getStoredMockLinkRequests(): LinkRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MOCK_LINK_REQUESTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LinkRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredMockLinkRequests(items: LinkRequest[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOCK_LINK_REQUESTS_KEY, JSON.stringify(items));
}

function ensureMockLinkRequests(): LinkRequest[] {
  const current = getStoredMockLinkRequests();
  if (current.length > 0) return current;

  const seeded: LinkRequest[] = [
    {
      id: "mock-link-1",
      childId: MOCK_CHILD.publicStudentId ?? MOCK_CHILD.email,
      southAfricanId: "0012311234088",
      status: "APPROVED",
      requestedAt: "2026-03-20T09:00:00.000Z",
    },
  ];
  saveStoredMockLinkRequests(seeded);
  return seeded;
}

function makeCsvBlob(lines: string[], fileName: string): {
  blob: Blob;
  fileName: string;
  contentType: string;
} {
  return {
    blob: new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    fileName,
    contentType: "text/csv;charset=utf-8",
  };
}

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
  if (isObject(data)) {
    if (Array.isArray(data.value)) return data.value as T[];
    if (Array.isArray(data.data)) return data.data as T[];
    if (Array.isArray(data.items)) return data.items as T[];
  }
  return [];
}

function unwrapObject(data: unknown): Record<string, unknown> | null {
  if (!isObject(data)) return null;
  if (isObject(data.value)) return data.value;
  if (isObject(data.data)) return data.data;
  return data;
}

function normalizeChild(row: unknown): ParentChild | null {
  if (!isObject(row)) return null;

  const id = toStringValue(row.childUserId ?? row.studentUserId ?? row.userId ?? row.id).trim();
  const email = toStringValue(row.email).trim();
  if (!id || !email) return null;

  const roleRaw = toStringValue(row.role, "STUDENT").toUpperCase();
  const role: "STUDENT" = roleRaw === "STUDENT" ? "STUDENT" : "STUDENT";

  let publicStudentId: string | null | undefined = undefined;
  const ps = row.publicStudentId ?? row.public_student_id ?? row.studentNumber ?? row.student_number;
  if (typeof ps === "string") publicStudentId = ps.trim() || null;
  if (ps === null) publicStudentId = null;

  const userId = toStringValue(row.userId, id).trim() || id;
  const childUserId = toStringValue(row.childUserId, id).trim() || id;
  const studentUserId = toStringValue(row.studentUserId, id).trim() || id;

  return {
    id,
    email,
    role,
    publicStudentId,
    studentNumber: publicStudentId ?? null,
    userId,
    childUserId,
    studentUserId,
  };
}

function normalizeLinkRequest(row: unknown): LinkRequest | null {
  if (!isObject(row)) return null;

  const id = toStringValue(row.id).trim();
  if (!id) return null;

  const southAfricanId = toStringValue(row.southAfricanId).trim();
  const childIdRaw = toStringValue(row.childId, southAfricanId).trim();
  const childId = southAfricanId || childIdRaw || "unknown";
  const status = toStringValue(row.status, "PENDING").toUpperCase();
  const requestedAt = toStringValue(row.requestedAt) || new Date().toISOString();

  return { id, childId, southAfricanId: southAfricanId || null, status, requestedAt };
}

function normalizeAdminLinkRequest(row: unknown): AdminLinkRequest | null {
  if (!isObject(row)) return null;

  const id = toStringValue(row.id).trim();
  const parentUserId = toStringValue(row.parentUserId).trim();
  const parentEmail = toStringValue(row.parentEmail).trim();
  const childUserId = toStringValue(row.childUserId).trim();
  const childEmail = toStringValue(row.childEmail).trim();
  const southAfricanId = toStringValue(row.southAfricanId).trim();
  const childId = toStringValue(row.childId, southAfricanId || childEmail || "unknown").trim();
  if (!id || !parentUserId || !parentEmail || !childUserId || !childEmail || !childId) return null;

  const status = toStringValue(row.status, "PENDING").toUpperCase();
  const requestedAt = toStringValue(row.requestedAt) || new Date().toISOString();
  const decidedAtRaw = row.decidedAt;
  const decidedByIdRaw = row.decidedById;
  const decidedByEmailRaw = row.decidedByEmail;

  return {
    id,
    status,
    requestedAt,
    decidedAt: typeof decidedAtRaw === "string" ? decidedAtRaw : null,
    parentUserId,
    parentEmail,
    childUserId,
    childEmail,
    childId,
    southAfricanId: southAfricanId || null,
    decidedById: typeof decidedByIdRaw === "string" ? decidedByIdRaw : null,
    decidedByEmail: typeof decidedByEmailRaw === "string" ? decidedByEmailRaw : null,
  };
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
  const outOf = toNumberValue(row.outOf ?? row.out_of, 100);
  const date = toStringValue(row.date ?? row.assessedAt ?? row.assessed_at, "");

  return { id, subject, score, outOf, date };
}

function normalizeFinanceNotification(row: unknown, index: number): FinanceNotification | null {
  if (!isObject(row)) return null;

  const id = toStringValue(row.id).trim() || `notification-${index}`;
  const title = toStringValue(row.title, "");
  const body = toStringValue(row.body, "");
  const severity = toStringValue(row.severity, "info");
  const createdAt = typeof row.createdAt === "string" ? row.createdAt : null;

  return { id, title, body, severity, createdAt };
}

function normalizeFinanceDocument(row: unknown, index: number): FinanceDocument | null {
  if (!isObject(row)) return null;

  const id = toStringValue(row.id).trim() || `document-${index}`;
  const kind = toStringValue(row.kind, "TRANSACTION");
  const type = toStringValue(row.type, kind || "TRANSACTION");
  const title = toStringValue(row.title, type || "Document");
  const amount = toNumberValue(row.amount, 0);
  const occurredAt = toStringValue(row.occurredAt, "");
  const descriptionRaw = row.description;
  const description = typeof descriptionRaw === "string" ? descriptionRaw : null;
  const documentUrl = typeof row.documentUrl === "string" ? row.documentUrl : null;

  return { id, kind, type, title, amount, occurredAt, description, documentUrl };
}

function normalizeFinanceSummary(data: unknown): FinanceSummary {
  const source = unwrapObject(data);
  if (!source) return { ...DEFAULT_FINANCE };

  const notificationsRaw = Array.isArray(source.notifications) ? source.notifications : [];
  const documentsRaw = Array.isArray(source.documents) ? source.documents : [];

  return {
    balance: toNumberValue(source.balance, DEFAULT_FINANCE.balance),
    currency: toStringValue(source.currency, "ZAR"),
    statements: toNumberValue(source.statements, DEFAULT_FINANCE.statements),
    lastPayment: typeof source.lastPayment === "string" ? source.lastPayment : null,
    status: toStringValue(source.status, DEFAULT_FINANCE.status),
    statusNote: typeof source.statusNote === "string" ? source.statusNote : source.statusNote === null ? null : undefined,
    notifications: notificationsRaw
      .map((n, i) => normalizeFinanceNotification(n, i))
      .filter((n): n is FinanceNotification => n !== null),
    documents: documentsRaw
      .map((d, i) => normalizeFinanceDocument(d, i))
      .filter((d): d is FinanceDocument => d !== null),
  };
}

function normalizeParentAttendanceRecord(row: unknown, index: number): ParentAttendanceRecord {
  if (!isObject(row)) {
    return {
      sessionId: `session-${index}`,
      date: "",
      startsAt: null,
      endsAt: null,
      moduleId: "",
      moduleCode: "",
      moduleName: "Unknown module",
      facultyName: "",
      status: "UNKNOWN",
      markedAt: "",
    };
  }

  return {
    sessionId: toStringValue(row.sessionId ?? row.session_id, `session-${index}`),
    date: toStringValue(row.date ?? row.attendanceDate, ""),
    startsAt: typeof row.startsAt === "string" ? row.startsAt : typeof row.starts_at === "string" ? row.starts_at : null,
    endsAt: typeof row.endsAt === "string" ? row.endsAt : typeof row.ends_at === "string" ? row.ends_at : null,
    moduleId: toStringValue(row.moduleId ?? row.module_id, ""),
    moduleCode: toStringValue(row.moduleCode ?? row.module_code, ""),
    moduleName: toStringValue(row.moduleName ?? row.module_name, "Unknown module"),
    facultyName: toStringValue(row.facultyName ?? row.faculty_name, ""),
    status: toStringValue(row.status, "UNKNOWN"),
    markedAt: toStringValue(row.markedAt ?? row.marked_at, ""),
  };
}

export async function parentPortalCheck(): Promise<ParentPortalInfo> {
  if (isMockDataEnabled()) {
    return { ok: true, role: "PARENT", message: "Mock parent portal active" };
  }
  const data = await apiGet<unknown>("/api/parent/parent");
  const source = unwrapObject(data);
  if (!source) {
    return { ok: false, role: "PARENT", message: "Parent portal unavailable" };
  }

  return {
    ok: Boolean(source.ok),
    role: toStringValue(source.role, "PARENT"),
    message: toStringValue(source.message, ""),
  };
}

export async function listMyChildren(): Promise<ParentChild[]> {
  if (isMockDataEnabled()) {
    ensureMockLinkRequests();
    return [MOCK_CHILD];
  }
  const data = await apiGet<unknown>("/api/parent/children");
  return unwrapList<unknown>(data)
    .map(normalizeChild)
    .filter((x): x is ParentChild => x !== null);
}

export async function linkChild(identifier: string): Promise<LinkChildResult> {
  if (isMockDataEnabled()) {
    return {
      created: false,
      pending: true,
      message: "Mock mode keeps parent links local-only.",
      child: MOCK_CHILD,
      childId:
        String(identifier ?? "").trim() ||
        (MOCK_CHILD.publicStudentId ?? MOCK_CHILD.email),
      southAfricanId: String(identifier ?? "").trim() || null,
    };
  }
  const cleaned = String(identifier ?? "").trim();
  const data = await apiPost<unknown>("/api/parent/children", {
    childId: cleaned,
    studentNumber: cleaned,
    publicStudentId: cleaned,
    southAfricanId: cleaned,
  });

  const source = unwrapObject(data);
  if (!source) {
    return { created: false, message: "Unexpected response from server" };
  }

  const child = normalizeChild(source.child);

  return {
    created: Boolean(source.created),
    pending: Boolean(source.pending),
    message: toStringValue(source.message, ""),
    child: child ?? undefined,
    childId: toStringValue(source.childId, ""),
    southAfricanId:
      typeof source.southAfricanId === "string"
        ? source.southAfricanId
        : source.southAfricanId === null
          ? null
          : undefined,
  };
}

export async function listLinkRequests(): Promise<LinkRequest[]> {
  if (isMockDataEnabled()) {
    return ensureMockLinkRequests();
  }
  const data = await apiGet<unknown>("/api/parent/parent/link-requests");
  return unwrapList<unknown>(data)
    .map(normalizeLinkRequest)
    .filter((x): x is LinkRequest => x !== null);
}

export async function createLinkRequest(southAfricanId: string): Promise<LinkRequestCreateResult> {
  if (isMockDataEnabled()) {
    const normalizedId = String(southAfricanId ?? "").replace(/\D+/g, "");
    const next: LinkRequest = {
      id: `mock-link-${Date.now()}`,
      childId: normalizedId || (MOCK_CHILD.publicStudentId ?? MOCK_CHILD.email),
      southAfricanId: normalizedId || null,
      status: "PENDING",
      requestedAt: new Date().toISOString(),
    };
    const current = ensureMockLinkRequests();
    saveStoredMockLinkRequests([next, ...current]);
    return next;
  }
  const data = await apiPost<unknown>("/api/parent/parent/link-requests", { southAfricanId });
  const source = unwrapObject(data);

  if (!source) {
    return {
      id: "unknown",
      childId: southAfricanId,
      southAfricanId,
      status: "PENDING",
      requestedAt: new Date().toISOString(),
    };
  }

  const returnedSouthAfricanId = toStringValue(source.southAfricanId, southAfricanId).trim();
  const returnedChildId = toStringValue(source.childId, returnedSouthAfricanId || southAfricanId);
  return {
    id: toStringValue(source.id, "unknown"),
    childId: returnedChildId,
    southAfricanId: returnedSouthAfricanId || null,
    status: toStringValue(source.status, "PENDING").toUpperCase(),
    requestedAt: toStringValue(source.requestedAt, new Date().toISOString()),
  };
}

export async function listAdminLinkRequests(
  status: AdminLinkRequestStatusFilter = "PENDING"
): Promise<AdminLinkRequest[]> {
  if (isMockDataEnabled()) {
    const rows = ensureMockLinkRequests().map((request) => ({
      id: request.id,
      status: request.status,
      requestedAt: request.requestedAt,
      decidedAt: request.status === "PENDING" ? null : new Date().toISOString(),
      parentUserId: "mock-parent-1",
      parentEmail: getMockParentEmail(),
      childUserId: MOCK_CHILD.id,
      childEmail: MOCK_CHILD.email,
      childId: request.childId,
      southAfricanId: request.southAfricanId ?? null,
      decidedById: request.status === "PENDING" ? null : "mock-admin-1",
      decidedByEmail: request.status === "PENDING" ? null : "admin@localhost.test",
    }));
    if (status === "ALL") return rows;
    return rows.filter((row) => row.status === status);
  }
  const qs = new URLSearchParams();
  qs.set("status", status);
  const data = await apiGet<unknown>(`/api/parent/admin/parent/link-requests?${qs.toString()}`);
  return unwrapList<unknown>(data)
    .map(normalizeAdminLinkRequest)
    .filter((x): x is AdminLinkRequest => x !== null);
}

export async function decideAdminLinkRequest(
  id: string,
  decision: AdminLinkRequestDecision
): Promise<{ ok: boolean; status: string }> {
  if (isMockDataEnabled()) {
    const current = ensureMockLinkRequests();
    saveStoredMockLinkRequests(
      current.map((request) =>
        request.id === id ? { ...request, status: decision } : request
      )
    );
    return { ok: true, status: decision };
  }
  const data = await apiPost<unknown>(`/api/parent/admin/parent/link-requests/${encodeURIComponent(id)}/decide`, {
    decision,
  });
  const source = unwrapObject(data);
  return {
    ok: source ? Boolean(source.ok) : true,
    status: source ? toStringValue(source.status, decision) : decision,
  };
}

export async function getResults(childId: string): Promise<Result[]> {
  if (isMockDataEnabled()) {
    return childId ? [...MOCK_RESULTS] : [];
  }
  const data = await apiGet<unknown>(`/api/parent/results?childId=${encodeURIComponent(childId)}`);
  return unwrapList<unknown>(data).map((row, index) => normalizeResult(row, index));
}

export async function getStudentResults(): Promise<Result[]> {
  if (isMockDataEnabled()) {
    return [...MOCK_RESULTS];
  }
  const data = await apiGet<unknown>("/api/parent/student/results");
  return unwrapList<unknown>(data).map((row, index) => normalizeResult(row, index));
}

export async function downloadResults(
  childId: string
): Promise<{ blob: Blob; fileName: string | null; contentType: string | null }> {
  if (isMockDataEnabled()) {
    const lines = ["Subject,Score,OutOf,Date", ...MOCK_RESULTS.map((row) => `${row.subject},${row.score},${row.outOf},${row.date}`)];
    return makeCsvBlob(lines, `mock-results-${encodeURIComponent(childId || "student")}.csv`);
  }
  return apiDownload(`/api/parent/results/download?childId=${encodeURIComponent(childId)}`);
}

export async function downloadStudentResults(): Promise<{
  blob: Blob;
  fileName: string | null;
  contentType: string | null;
}> {
  if (isMockDataEnabled()) {
    const lines = ["Subject,Score,OutOf,Date", ...MOCK_RESULTS.map((row) => `${row.subject},${row.score},${row.outOf},${row.date}`)];
    return makeCsvBlob(lines, "mock-student-results.csv");
  }
  return apiDownload("/api/parent/student/results/download");
}

export async function listResultsForStaff(childId: string): Promise<Result[]> {
  if (isMockDataEnabled()) {
    return childId ? [...MOCK_RESULTS] : [];
  }
  const data = await apiGet<unknown>(`/api/parent/admin/results?childId=${encodeURIComponent(childId)}`);
  return unwrapList<unknown>(data).map((row, index) => normalizeResult(row, index));
}

export async function downloadResultsForStaff(
  childId: string
): Promise<{ blob: Blob; fileName: string | null; contentType: string | null }> {
  if (isMockDataEnabled()) {
    const lines = ["Subject,Score,OutOf,Date", ...MOCK_RESULTS.map((row) => `${row.subject},${row.score},${row.outOf},${row.date}`)];
    return makeCsvBlob(lines, `mock-admin-results-${encodeURIComponent(childId || "student")}.csv`);
  }
  return apiDownload(`/api/parent/admin/results/download?childId=${encodeURIComponent(childId)}`);
}

export async function createResultForStaff(input: StaffResultInput): Promise<Result> {
  if (isMockDataEnabled()) {
    return {
      id: `mock-result-${Date.now()}`,
      subject: input.subject,
      score: input.score,
      outOf: input.outOf ?? 100,
      date: input.date ?? new Date().toISOString().slice(0, 10),
    };
  }
  const data = await apiPost<unknown>("/api/parent/admin/results", input);
  return normalizeResult(data, 0);
}

export async function updateResultForStaff(id: string, input: StaffResultUpdateInput): Promise<Result> {
  if (isMockDataEnabled()) {
    const current = MOCK_RESULTS.find((row) => row.id === id) ?? MOCK_RESULTS[0];
    return {
      id,
      subject: input.subject ?? current.subject,
      score: input.score ?? current.score,
      outOf: input.outOf ?? current.outOf,
      date: input.date ?? current.date,
    };
  }
  const data = await apiPost<unknown>(`/api/parent/admin/results/${encodeURIComponent(id)}/update`, input);
  return normalizeResult(data, 0);
}

export async function deleteResultForStaff(id: string): Promise<void> {
  if (isMockDataEnabled()) {
    void id;
    return;
  }
  await apiDelete<void>(`/api/parent/admin/results/${encodeURIComponent(id)}`);
}

export async function getFinance(childId: string): Promise<FinanceSummary> {
  if (isMockDataEnabled()) {
    return childId ? { ...MOCK_FINANCE } : { ...DEFAULT_FINANCE };
  }
  const data = await apiGet<unknown>(`/api/parent/finance?childId=${encodeURIComponent(childId)}`);
  return normalizeFinanceSummary(data);
}

export async function downloadFinanceStatement(
  childId: string
): Promise<{ blob: Blob; fileName: string | null; contentType: string | null }> {
  if (isMockDataEnabled()) {
    const lines = [
      "Type,Title,Amount,OccurredAt",
      ...MOCK_FINANCE.documents.map((row) => `${row.type},${row.title ?? ""},${row.amount},${row.occurredAt}`),
    ];
    return makeCsvBlob(lines, `mock-finance-statement-${encodeURIComponent(childId || "student")}.csv`);
  }
  return apiDownload(`/api/parent/finance/statement?childId=${encodeURIComponent(childId)}`);
}

export async function getParentAttendance(
  childId: string,
  params?: { from?: string; to?: string }
): Promise<ParentAttendanceRecord[]> {
  if (isMockDataEnabled()) {
    if (!childId) return [];

    const fromTime = params?.from ? new Date(params.from).getTime() : Number.NEGATIVE_INFINITY;
    const toTime = params?.to ? new Date(params.to).getTime() : Number.POSITIVE_INFINITY;

    return MOCK_ATTENDANCE.filter((row) => {
      const rowTime = new Date(row.date).getTime();
      return rowTime >= fromTime && rowTime <= toTime;
    });
  }
  const qs = new URLSearchParams();
  qs.set("childId", childId);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);

  const data = await apiGet<unknown>(`/api/parent/attendance?${qs.toString()}`);
  return unwrapList<unknown>(data).map((row, index) => normalizeParentAttendanceRecord(row, index));
}
