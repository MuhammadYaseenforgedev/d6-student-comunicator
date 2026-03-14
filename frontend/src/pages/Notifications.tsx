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

const CATEGORY_OPTIONS: Array<{ value: "ALL" | NotificationCategory; label: string }> = [
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
  if (category === "MESSAGE") return "border-blue-500/30 bg-blue-500/15 text-blue-100";
  if (category === "EMERGENCY") return "border-red-500/30 bg-red-500/15 text-red-100";
  if (category === "ATTENDANCE") return "border-emerald-500/30 bg-emerald-500/15 text-emerald-100";
  if (category === "RESULT") return "border-cyan-500/30 bg-cyan-500/15 text-cyan-100";
  if (category === "FINANCE") return "border-amber-500/30 bg-amber-500/15 text-amber-100";
  if (category === "PARENT_LINK") return "border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-100";
  return "border-slate-500/30 bg-slate-500/15 text-slate-100";
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
        setError(e instanceof Error ? e.message : "Failed to load notifications");
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
      setItems((current) => [...current, ...(Array.isArray(result.value) ? result.value : [])]);
      setNextBefore(result.nextBefore ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more notifications");
    } finally {
      setLoadingMore(false);
    }
  }

  async function onMarkRead(notificationId: string) {
    try {
      setBusyId(notificationId);
      await markNotificationRead(notificationId);
      if (unreadOnly) {
        setItems((current) => current.filter((item) => item.id !== notificationId));
      } else {
        setItems((current) =>
          current.map((item) =>
            item.id === notificationId
              ? { ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() }
              : item
          )
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark notification as read");
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
      setError(e instanceof Error ? e.message : "Failed to mark notifications as read");
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
              className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-900/50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={busyAll || items.length === 0}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
            >
              {busyAll ? "Updating..." : "Mark all read"}
            </button>
          </>
        }
      />

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORY_OPTIONS.map((option) => {
            const active = category === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategory(option.value)}
                className={[
                  "rounded-full border px-3 py-1 text-sm transition",
                  active
                    ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                    : "border-slate-700 bg-slate-950/40 text-slate-300 hover:bg-slate-900/60",
                ].join(" ")}
              >
                {option.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setUnreadOnly((current) => !current)}
            className={[
              "ml-auto rounded-full border px-3 py-1 text-sm transition",
              unreadOnly
                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                : "border-slate-700 bg-slate-950/40 text-slate-300 hover:bg-slate-900/60",
            ].join(" ")}
          >
            {unreadOnly ? "Unread only" : "Show unread only"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-6 text-sm text-slate-300">
            Loading notifications...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-6 text-sm text-slate-300">
            No notifications for the current filter.
          </div>
        ) : (
          items.map((item) => {
            const href = notificationHref(item);
            return (
              <div
                key={item.id}
                className={[
                  "rounded-2xl border p-4 transition",
                  item.isRead
                    ? "border-slate-800 bg-slate-950/25"
                    : "border-cyan-500/20 bg-cyan-950/10 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={["rounded-full border px-2 py-1 text-xs font-semibold", badgeClass(item.category)].join(" ")}>
                        {item.category}
                      </span>
                      {!item.isRead && <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />}
                      <span className="text-xs text-slate-400">{formatWhen(item.createdAt)}</span>
                    </div>

                    <div className="text-base font-semibold text-white">{item.title}</div>
                    {item.body && <div className="text-sm text-slate-300">{item.body}</div>}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {href && (
                      <Link
                        to={href}
                        className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900/70"
                      >
                        Open
                      </Link>
                    )}
                    {!item.isRead && (
                      <button
                        type="button"
                        onClick={() => void onMarkRead(item.id)}
                        disabled={busyId === item.id}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
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

      {nextBefore && items.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-lg border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900/70 disabled:opacity-60"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
