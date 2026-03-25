import { apiClient } from "./apiClient";

export type SupportTicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type SupportTicketIssueType =
  | "ACCOUNT_ACCESS"
  | "NETWORK"
  | "POWER"
  | "SOFTWARE"
  | "DEVICE"
  | "OTHER";

export type SupportTicketPublic = {
  id: string;
  requesterEmail: string;
  requesterName: string | null;
  deviceNumber: string | null;
  issueType: SupportTicketIssueType;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type SupportTicketAdmin = SupportTicketPublic & {
  message: string;
  adminNote: string | null;
  assignedTo: string | null;
  assignedEmail: string | null;
};

export async function submitSupportTicket(input: {
  email: string;
  name?: string;
  deviceNumber?: string;
  issueType: SupportTicketIssueType;
  message: string;
}) {
  return apiClient.post<{ ok: boolean; ticket: SupportTicketPublic }>("/support/tickets", input, { auth: false });
}

export async function listSupportTicketsByEmail(email: string) {
  const qs = new URLSearchParams({ email: email.trim().toLowerCase() });
  return apiClient.get<{ value: SupportTicketPublic[]; count: number }>(`/support/tickets?${qs.toString()}`, {
    auth: false,
  });
}

export async function listAdminSupportTickets(params?: { q?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.status?.trim()) qs.set("status", params.status.trim().toUpperCase());
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiClient.get<{ value: SupportTicketAdmin[]; count: number }>(`/support/admin/tickets${suffix}`);
}

export async function updateAdminSupportTicket(
  ticketId: string,
  input: { status?: SupportTicketStatus; adminNote?: string | null }
) {
  return apiClient.patch<{ ok: boolean; ticket: SupportTicketAdmin }>(
    `/support/admin/tickets/${encodeURIComponent(ticketId)}`,
    input
  );
}
