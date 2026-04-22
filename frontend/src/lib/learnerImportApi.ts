import { apiPostForm } from "./api";
import { apiClient } from "./apiClient";

export type LearnerOnboardingStatus =
  | "PENDING_ACTIVATION"
  | "INVITED"
  | "ACTIVATED"
  | string;

export type ImportedLearner = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  learnerName: string;
  studentNumber: string | null;
  externalSource: string | null;
  externalSourceId: string | null;
  activationRequired: boolean;
  onboardingStatus: LearnerOnboardingStatus;
  activationInvitedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  hasActiveActivationToken: boolean;
  canReissueActivation: boolean;
  courseName?: string | null;
  courseCode?: string | null;
};

export type ImportedLearnerListResponse = {
  value: ImportedLearner[];
  count: number;
  total: number;
  limit: number;
  offset: number;
};

export type ActivationIssueResponse = {
  ok: boolean;
  activation?: {
    issued?: boolean;
    operationalStatus?: string;
  };
};

export type LearnerCsvImportSummary = {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
};

export type LearnerCsvImportResult = {
  rowNumber?: number;
  row?: number;
  email?: string;
  status?: string;
  action?: string;
  message?: string;
  error?: string;
  errors?: string[];
};

export type LearnerCsvImportResponse = {
  ok: boolean;
  summary: LearnerCsvImportSummary;
  results: LearnerCsvImportResult[];
};

export async function importApprovedLearnersCsv(
  file: File
): Promise<LearnerCsvImportResponse> {
  const form = new FormData();
  form.append("file", file);
  return apiPostForm<LearnerCsvImportResponse>(
    "/api/admin/imports/approved-learners/csv",
    form
  );
}

export async function listImportedLearners(params?: {
  q?: string;
  onboardingStatus?: "ALL" | "PENDING_ACTIVATION" | "INVITED" | "ACTIVATED";
  limit?: number;
  offset?: number;
}): Promise<ImportedLearnerListResponse> {
  const qs = new URLSearchParams();
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.onboardingStatus && params.onboardingStatus !== "ALL") {
    qs.set("onboardingStatus", params.onboardingStatus);
  }
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiClient.get<ImportedLearnerListResponse>(`/admin/imports/learners${suffix}`);
}

export async function sendLearnerActivation(
  userId: string
): Promise<ActivationIssueResponse> {
  return apiClient.post<ActivationIssueResponse>(
    `/admin/imports/${encodeURIComponent(userId)}/send-activation`,
    {}
  );
}
