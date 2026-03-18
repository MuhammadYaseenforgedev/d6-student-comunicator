import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotificationsRefresh,
  type NotificationCategory,
  type NotificationRecord,
} from "../api/notifications";

const CATEGORY_OPTIONS: Array<{
  value: "ALL" | NotificationCategory;
  label: string;
}> = [
  { value: "ALL", label: "All" },
  { value: "MESSAGE", label: "Messages" },
  { value: "ANNOUNCEMENT", label: "Announcements" },
  { value: "EMERGENCY", label: "Emergency" },
  { value: "ATTENDANCE", label: "Attendance" },
  { value: "RESULT", label: "Results" },
  { value: "FINANCE", label: "Finance" },
  { value: "PARENT_LINK", label: "Parent Links" },
];

function badgeClass(category: NotificationCategory): string {
  if (category === "MESSAGE") {
    return "border-[rgba(79,166,255,0.30)] bg-[rgba(79,166,255,0.14)] text-[#d9eeff]";
  }
  if (category === "EMERGENCY") {
    return "border-[rgba(255,102,146,0.30)] bg-[rgba(255,102,146,0.14)] text-[#ffdbe6]";
  }
  if (category === "ATTENDANCE") {
    return "border-[rgba(52,211,153,0.30)] bg-[rgba(52,211,153,0.14)] text-[#d9fff1]";
  }
  if (category === "RESULT") {
    return "border-[rgba(140,235,255,0.30)] bg-[rgba(140,235,255,0.14)] text-[#dbfaff]";
  }
  if (category === "FINANCE") {
    return "border-[rgba(255,196,87,0.30)] bg-[rgba(255,196,87,0.14)] text-[#ffecc2]";
  }
  if (category === "PARENT_LINK") {
    return "border-[rgba(217,70,239,0.30)] bg-[rgba(217,70,239,0.14)] text-[#f8ddff]";
  }

  return "border-[rgba(148,163,184,0.30)] bg-[rgba(148,163,184,0.14)] text-slate-100";
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function notificationHref(notification: NotificationRecord): string | null {
  const href = notification.meta?.href;
  return typeof href === "string" && href.trim() ? href : null;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [category, setCategory] = useState<"ALL" | NotificationCategory>("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(quiet = false) {
      try {
        if (!quiet) setLoading(true);
        const result = await listNotifications({
          limit: 50,
          unreadOnly,
          categories: category === "ALL" ? undefined : [category],
        });
        if (cancelled) return;
        setItems(Array.isArray(result.value) ? result.value : []);
        setNextBefore(result.nextBefore ?? null);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Failed to load notifications"
        );
      } finally {
        if (!quiet && !cancelled) setLoading(false);
      }
    }

    void load();
    const intervalId = window.setInterval(() => {
      void load(true);
    }, 20_000);
    const unsubscribe = subscribeNotificationsRefresh(() => {
      void load(true);
    });

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, [category, unreadOnly, refreshTick]);

  async function loadMore() {
    if (!nextBefore || loadingMore) return;

    try {
      setLoadingMore(true);
      const result = await listNotifications({
        limit: 50,
        before: nextBefore,
        unreadOnly,
        categories: category === "ALL" ? undefined : [category],
      });
      setItems((current) => [
        ...current,
        ...(Array.isArray(result.value) ? result.value : []),
      ]);
      setNextBefore(result.nextBefore ?? null);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load more notifications"
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function onMarkRead(notificationId: string) {
    try {
      setBusyId(notificationId);
      await markNotificationRead(notificationId);
      if (unreadOnly) {
        setItems((current) =>
          current.filter((item) => item.id !== notificationId)
        );
      } else {
        setItems((current) =>
          current.map((item) =>
            item.id === notificationId
              ? {
                  ...item,
                  isRead: true,
                  readAt: item.readAt ?? new Date().toISOString(),
                }
              : item
          )
        );
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to mark notification as read"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onMarkAllRead() {
    try {
      setBusyAll(true);
      await markAllNotificationsRead(category === "ALL" ? undefined : [category]);
      if (unreadOnly) {
        setItems([]);
      } else {
        setItems((current) =>
          current.map((item) => ({
            ...item,
            isRead: true,
            readAt: item.readAt ?? new Date().toISOString(),
          }))
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to mark notifications as read"
      );
    } finally {
      setBusyAll(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Unread and read activity across messages, emergency alerts, attendance, results, finance, and parent links."
        actions={
          <>
            <button
              type="button"
              onClick={() => setRefreshTick((current) => current + 1)}
              className="btn-secondary min-w-[110px]"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={busyAll || items.length === 0}
              className="btn-primary min-w-[150px]"
            >
              {busyAll ? "Updating..." : "Mark all read"}
            </button>
          </>
        }
      />

      <section className="teal-glow-card p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Filters</h2>
              <p className="mt-1 text-sm text-white/72">
                Narrow notifications by category or unread state.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setUnreadOnly((current) => !current)}
              className={[
                "tab-pill self-start xl:self-auto",
                unreadOnly ? "tab-pill-active" : "tab-pill-idle",
              ].join(" ")}
            >
              {unreadOnly ? "Unread only" : "Show unread only"}
            </button>
          </div>

          <div className="divider-soft" />

          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((option) => {
              const active = category === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCategory(option.value)}
                  className={[
                    "tab-pill",
                    active ? "tab-pill-active" : "tab-pill-idle",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <section className="teal-glow-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Activity Feed</h2>
            <p className="mt-1 text-sm text-white/72">
              {loading
                ? "Loading notifications..."
                : `${items.length} notification(s) shown`}
            </p>
          </div>

          <div className="rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.56)] px-3 py-2 text-xs text-white/70">
            Live updates enabled
          </div>
        </div>

        <div className="divider-soft my-5" />

        <div className="space-y-3">
          {loading ? (
            <div className="info-banner">Loading notifications...</div>
          ) : items.length === 0 ? (
            <div className="info-banner">
              No notifications for the current filter.
            </div>
          ) : (
            items.map((item) => {
              const href = notificationHref(item);

              return (
                <div
                  key={item.id}
                  className={[
                    "rounded-3xl border p-4 transition-all duration-200",
                    item.isRead
                      ? "border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.50)]"
                      : "border-[rgba(140,235,255,0.24)] bg-[rgba(14,42,99,0.28)] shadow-[0_0_0_1px_rgba(140,235,255,0.05),0_0_18px_rgba(140,235,255,0.08)]",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "rounded-full border px-2.5 py-1 text-xs font-semibold",
                            badgeClass(item.category),
                          ].join(" ")}
                        >
                          {item.category}
                        </span>

                        {!item.isRead && <span className="status-dot" />}

                        <span className="text-xs text-white/55">
                          {formatWhen(item.createdAt)}
                        </span>
                      </div>

                      <div className="text-base font-semibold text-white">
                        {item.title}
                      </div>

                      {item.body && (
                        <div className="text-sm leading-6 text-white/72">
                          {item.body}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {href && (
                        <Link to={href} className="btn-secondary">
                          Open
                        </Link>
                      )}

                      {!item.isRead && (
                        <button
                          type="button"
                          onClick={() => void onMarkRead(item.id)}
                          disabled={busyId === item.id}
                          className="btn-primary"
                        >
                          {busyId === item.id ? "Saving..." : "Mark read"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {nextBefore && items.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="btn-secondary min-w-[140px]"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}