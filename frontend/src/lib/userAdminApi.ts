import type { AdminScope } from "./auth";
import { apiDownload } from "./api";
import { apiClient } from "./apiClient";

export type AdminAccountRole = "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";
export const ADMIN_ACCOUNT_ROLES: AdminAccountRole[] = ["ADMIN", "LECTURER", "STUDENT", "PARENT"];

export type AdminAccount = {
  id: string;
  email: string;
  role: AdminAccountRole;
  adminScope: AdminScope | null;
  firstName: string | null;
  lastName: string | null;
  courseName: string | null;
  studentNumber: string | null;
  idNumber?: string | null;
  canLinkChildren: boolean;
  createdAt: string;
};

export async function listAdminAccounts(params?: {
  roles?: AdminAccountRole[];
  q?: string;
  limit?: number;
}): Promise<AdminAccount[]> {
  const qs = new URLSearchParams();
  if (params?.roles?.length) {
    for (const role of params.roles) qs.append("role", role);
  }
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.limit) qs.set("limit", String(params.limit));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const data = await apiClient.get<{ value: AdminAccount[] }>(`/users/admin/accounts${suffix}`);
  return Array.isArray(data.value) ? data.value : [];
}

export async function deleteAdminAccount(userId: string) {
  return apiClient.delete<{ ok: boolean; user: { id: string; email: string; role: AdminAccountRole } }>(
    `/users/admin/accounts/${encodeURIComponent(userId)}`
  );
}

export async function createAdminAccount(input: {
  email: string;
  password: string;
  role: AdminAccountRole;
  studentNumber?: string;
  southAfricanId?: string;
  adminScope?: AdminScope;
}) {
  return apiClient.post<{ user: AdminAccount }>(`/auth/admin-create`, input);
}

export async function updateAdminAccount(
  userId: string,
  input: {
    password?: string;
    studentNumber?: string;
    adminScope?: AdminScope;
  }
) {
  return apiClient.patch<{ ok: boolean; user: AdminAccount }>(`/users/admin/accounts/${encodeURIComponent(userId)}`, input);
}

export async function downloadStudentNumbersCsv() {
  return apiDownload("/api/users/admin/accounts/students.csv");
}
