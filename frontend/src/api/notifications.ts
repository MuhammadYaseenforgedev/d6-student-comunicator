import { apiGet, apiPost } from "../lib/api";

export type NotificationCategory =
  | "MESSAGE"
  | "ANNOUNCEMENT"
  | "EMERGENCY"
  | "ATTENDANCE"
  | "RESULT"
  | "FINANCE"
  | "PARENT_LINK";

export type NotificationRecord = {
  id: string;
  userId: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  meta: Record<string, unknown>;
  sourceKey: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type NotificationListResponse = {
  value: NotificationRecord[];
  count: number;
  nextBefore: string | null;
};

export type NotificationSummary = {
  totalUnread: number;
  counts: Partial<Record<NotificationCategory, number>>;
};

const NOTIFICATION_REFRESH_EVENT = "d6-notifications-refresh";

export function emitNotificationsRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATION_REFRESH_EVENT));
}

export function subscribeNotificationsRefresh(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(NOTIFICATION_REFRESH_EVENT, listener);
  return () => window.removeEventListener(NOTIFICATION_REFRESH_EVENT, listener);
}

export async function listNotifications(params?: {
  limit?: number;
  before?: string;
  unreadOnly?: boolean;
  categories?: NotificationCategory[];
}): Promise<NotificationListResponse> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.before) qs.set("before", params.before);
  if (params?.unreadOnly) qs.set("unreadOnly", "true");
  if (params?.categories?.length) {
    for (const category of params.categories) {
      qs.append("category", category);
    }
  }

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiGet<NotificationListResponse>(`/api/notifications${suffix}`);
}

export async function fetchNotificationSummary(): Promise<NotificationSummary> {
  return apiGet<NotificationSummary>("/api/notifications/summary");
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await apiPost<{ ok: true }>(`/api/notifications/${notificationId}/read`, {});
  emitNotificationsRefresh();
}

export async function markAllNotificationsRead(categories?: NotificationCategory[]): Promise<number> {
  const result = await apiPost<{ ok: boolean; updated: number }>("/api/notifications/read-all", {
    categories,
  });
  emitNotificationsRefresh();
  return Number(result.updated ?? 0);
}
