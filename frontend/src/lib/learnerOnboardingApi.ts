import { apiClient } from "./apiClient";

export type LearnerOnboardingStatus =
  | "PENDING_ACTIVATION"
  | "INVITED"
  | "ACTIVATED"
  | string
  | null;

export type LearnerOnboardingRecord = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  learnerName: string;
  studentNumber: string | null;
  courseId?: string | null;
  courseCode?: string | null;
  courseName?: string | null;
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
};

export type LearnerOnboardingListResponse = {
  value: LearnerOnboardingRecord[];
  count: number;
  total: number;
  limit: number;
  offset: number;
};

export type LearnerOnboardingStatusFilter =
  | "ALL"
  | "PENDING_ACTIVATION"
  | "INVITED"
  | "ACTIVATED";

export async function listLearnerOnboardingRecords(params?: {
  q?: string;
  onboardingStatus?: LearnerOnboardingStatusFilter;
  activationRequired?: boolean | null;
  source?: string;
  limit?: number;
  offset?: number;
}): Promise<LearnerOnboardingListResponse> {
  const qs = new URLSearchParams();
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.onboardingStatus && params.onboardingStatus !== "ALL") {
    qs.set("onboardingStatus", params.onboardingStatus);
  }
  if (typeof params?.activationRequired === "boolean") {
    qs.set("activationRequired", String(params.activationRequired));
  }
  if (params?.source?.trim()) qs.set("source", params.source.trim());
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiClient.get<LearnerOnboardingListResponse>(`/admin/imports/learners${suffix}`);
}

export async function sendLearnerActivation(userId: string) {
  return apiClient.post<{
    ok: boolean;
    activation?: {
      issued?: boolean;
      operationalStatus?: string;
      activationUrl?: string;
      expiresAt?: string;
      onboardingStatus?: LearnerOnboardingStatus;
    };
  }>(`/admin/imports/${encodeURIComponent(userId)}/send-activation`, {});
}
