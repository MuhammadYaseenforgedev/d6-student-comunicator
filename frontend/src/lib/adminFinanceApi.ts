import { apiDownload } from "../lib/api";
import { apiClient } from "./apiClient";

export type FinanceLinkedParent = {
  id: string;
  email: string;
};

export type AdminFinanceAccount = {
  studentId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  courseName: string | null;
  studentNumber: string | null;
  balance: number;
  currency: string;
  status: string;
  statusNote: string | null;
  updatedAt: string | null;
  parents: FinanceLinkedParent[];
};

export type AdminFinanceOverview = {
  balance: number;
  currency: string;
  status: string;
  statusNote: string | null;
  statements: number;
  lastPayment: string | null;
};

export type AdminFinanceTransaction = {
  id: string;
  amount: number;
  currency: string;
  description: string;
  occurredAt: string;
  createdAt: string;
};

export type AdminFinanceDocument = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  amount: number | null;
  currency: string;
  issuedAt: string;
  documentUrl: string | null;
  createdAt: string;
};

export type AdminFinanceNotification = {
  id: string;
  title: string;
  body: string;
  severity: string;
  createdAt: string;
};

export type AdminFinanceDetail = {
  student: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    courseName: string | null;
    studentNumber: string | null;
    parents: FinanceLinkedParent[];
  };
  summary: AdminFinanceOverview;
  transactions: AdminFinanceTransaction[];
  documents: AdminFinanceDocument[];
  notifications: AdminFinanceNotification[];
};

export async function listAdminFinanceAccounts(params?: { q?: string; limit?: number }): Promise<AdminFinanceAccount[]> {
  const qs = new URLSearchParams();
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const data = await apiClient.get<{ value: AdminFinanceAccount[] }>(`/finance/admin/accounts${suffix}`);
  return Array.isArray(data.value) ? data.value : [];
}

export async function getAdminFinanceAccount(studentId: string): Promise<AdminFinanceDetail> {
  return apiClient.get<AdminFinanceDetail>(`/finance/admin/accounts/${encodeURIComponent(studentId)}`);
}

export async function updateAdminFinanceAccount(
  studentId: string,
  input: {
    balance?: number;
    currency?: string;
    status?: string;
    statusNote?: string | null;
  }
): Promise<AdminFinanceDetail> {
  return apiClient.patch<AdminFinanceDetail>(`/finance/admin/accounts/${encodeURIComponent(studentId)}`, input);
}

export async function createAdminFinanceTransaction(
  studentId: string,
  input: {
    amount: number;
    currency?: string;
    description: string;
    occurredAt?: string;
  }
): Promise<{ ok: boolean; transaction: AdminFinanceTransaction; detail: AdminFinanceDetail | null }> {
  return apiClient.post<{ ok: boolean; transaction: AdminFinanceTransaction; detail: AdminFinanceDetail | null }>(
    `/finance/admin/accounts/${encodeURIComponent(studentId)}/transactions`,
    input
  );
}

export async function createAdminFinanceDocument(
  studentId: string,
  input: {
    type: string;
    title: string;
    description?: string;
    amount?: number | null;
    currency?: string;
    issuedAt?: string;
    documentUrl?: string;
  }
): Promise<{ ok: boolean; document: AdminFinanceDocument; detail: AdminFinanceDetail | null }> {
  return apiClient.post<{ ok: boolean; document: AdminFinanceDocument; detail: AdminFinanceDetail | null }>(
    `/finance/admin/accounts/${encodeURIComponent(studentId)}/documents`,
    input
  );
}

export async function createAdminFinanceNotification(
  studentId: string,
  input: {
    title: string;
    body: string;
    severity: string;
  }
): Promise<{ ok: boolean; notification: AdminFinanceNotification; detail: AdminFinanceDetail | null }> {
  return apiClient.post<{ ok: boolean; notification: AdminFinanceNotification; detail: AdminFinanceDetail | null }>(
    `/finance/admin/accounts/${encodeURIComponent(studentId)}/notifications`,
    input
  );
}

export async function downloadAdminFinanceStatement(
  studentId: string
): Promise<{ blob: Blob; fileName: string | null; contentType: string | null }> {
  return apiDownload(`/api/finance/admin/accounts/${encodeURIComponent(studentId)}/statement`);
}
