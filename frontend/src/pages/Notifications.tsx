import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationCategory,
  type NotificationRecord,
} from "../api/notifications";
import { getUser } from "../lib/auth";

type TypeFilter = "ALL" | "NORMAL" | "EMERGENCY";

const CATEGORY_OPTIONS: Array<{ value: "ALL" | NotificationCategory; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "MESSAGE", label: "Messages" },
  { value: "ANNOUNCEMENT", label: "Announcements" },
  { value: "EMERGENCY", label: "Emergency" },
  { value: "ATTENDANCE", label: "Attendance" },
  { value: "RESULT", label: "Results" },
  { value: "FINANCE", label: "Finance" },
  { value: "PARENT_LINK", label: "Parent links" },
];

const DELIVERY_CHANNELS = [
  { id: "app", label: "App" },
  { id: "sms", label: "SMS" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;

function normalizeType(notification: NotificationRecord): "normal" | "emergency" {
  const raw = `${notification.type} ${notification.category}`.toLowerCase();
  return raw.includes("emergency") ? "emergency" : "normal";
}

function getChannels(notification: NotificationRecord): string[] {
  const meta = notification.meta ?? {};
  const raw = meta.channels ?? meta.deliveryChannels ?? meta.delivery_channel ?? meta.channel;
  const values = Array.isArray(raw) ? raw : raw ? [raw] : ["app"];
  const normalized = values
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(normalized.length ? normalized : ["app"]));
}

function getStatus(notification: NotificationRecord): string {
  const meta = notification.meta ?? {};
  return String(meta.status ?? meta.deliveryStatus ?? (notification.isRead ? "read" : "unread"))
    .trim()
    .toUpperCase();
}

function formatDate(raw: string): string {
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  return new Date(ms).toLocaleString();
}

function ChannelBadge({ channel }: { channel: string }) {
  const label =
    DELIVERY_CHANNELS.find((item) => item.id === channel.toLowerCase())?.label ??
    channel.toUpperCase();

  return (
    <span className="rounded-full border border-[rgba(140,235,255,0.20)] bg-[rgba(8,18,48,0.58)] px-2.5 py-1 text-[11px] font-semibold text-[#dffbff]">
      {label}
    </span>
  );
}

function TypeBadge({ type }: { type: "normal" | "emergency" }) {
  const className =
    type === "emergency"
      ? "border-[rgba(255,94,130,0.36)] bg-[rgba(74,10,31,0.72)] text-[#ffdce5] shadow-[0_0_18px_rgba(255,94,130,0.18)]"
      : "border-[rgba(140,235,255,0.24)] bg-[rgba(140,235,255,0.10)] text-[#dffbff]";

  return (
    <span className={["rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]", className].join(" ")}>
      {type}
    </span>
  );
}

function NotificationSkeleton() {
  return (
    <div className="teal-glow-card animate-pulse p-5">
      <div className="h-4 w-36 rounded-full bg-white/10" />
      <div className="mt-4 h-5 w-2/3 rounded-full bg-white/10" />
      <div className="mt-3 h-4 w-full rounded-full bg-white/10" />
      <div className="mt-2 h-4 w-5/6 rounded-full bg-white/10" />
    </div>
  );
}

function ComposePanel() {
  const user = getUser();
  const canCompose = user?.role === "ADMIN" || user?.role === "LECTURER";
  const [notificationType, setNotificationType] = useState<"normal" | "emergency">("normal");
  const [channels, setChannels] = useState<string[]>(["app"]);

  if (!canCompose) return null;

  return (
    <section className="teal-glow-card space-y-4 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-lg font-semibold text-white">Notification setup</div>
          <div className="mt-1 text-sm leading-6 text-white/72">
            Select priority and delivery channels for the next backend-backed notification flow.
          </div>
        </div>
        <span className="rounded-full border border-[rgba(255,196,87,0.24)] bg-[rgba(97,59,9,0.42)] px-3 py-1 text-xs font-semibold text-[#ffe8b0]">
          Delivery handled by API
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="notification-type" className="text-sm text-white/78">
            Notification type
          </label>
          <select
            id="notification-type"
            value={notificationType}
            onChange={(event) => setNotificationType(event.target.value as "normal" | "emergency")}
            className="select-glass mt-1"
          >
            <option value="normal">Normal</option>
            <option value="emergency">Emergency</option>
          </select>
        </div>

        <fieldset className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.52)] p-4">
          <legend className="px-1 text-sm text-white/78">Delivery channels</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DELIVERY_CHANNELS.map((channel) => {
              const active = channels.includes(channel.id);
              return (
                <label
                  key={channel.id}
                  className={[
                    "cursor-pointer rounded-full border px-3 py-2 text-sm transition",
                    active
                      ? "border-[rgba(140,235,255,0.34)] bg-[rgba(140,235,255,0.12)] text-white"
                      : "border-white/10 bg-white/5 text-white/64 hover:border-[rgba(140,235,255,0.24)]",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) => {
                      setChannels((current) => {
                        if (event.target.checked) return Array.from(new Set([...current, channel.id]));
                        const next = current.filter((item) => item !== channel.id);
                        return next.length ? next : ["app"];
                      });
                    }}
                    className="sr-only"
                  />
                  {channel.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div
        className={[
          "rounded-2xl border p-4 text-sm leading-6",
          notificationType === "emergency"
            ? "border-[rgba(255,94,130,0.28)] bg-[rgba(74,10,31,0.54)] text-[#ffdce5]"
            : "border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.54)] text-white/74",
        ].join(" ")}
      >
        {notificationType === "emergency"
          ? "Emergency notifications will be shown with high-priority styling. The send action stays disabled until Muhammad's delivery endpoint is connected."
          : "Normal notifications use the standard app priority. The selected channel metadata is ready for the backend contract."}
      </div>

      <button type="button" disabled className="btn-primary opacity-60">
        Send notification pending backend delivery
      </button>
    </section>
  );
}

export default function Notifications() {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [category, setCategory] = useState<"ALL" | NotificationCategory>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const response = await listNotifications({
        limit: 80,
        unreadOnly,
        categories: category === "ALL" ? undefined : [category],
      });
      setItems(response.value ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, unreadOnly]);

  const visibleItems = useMemo(() => {
    if (typeFilter === "ALL") return items;
    return items.filter((item) => normalizeType(item).toUpperCase() === typeFilter);
  }, [items, typeFilter]);

  async function onMarkRead(id: string) {
    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await markNotificationRead(id);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, isRead: true } : item))
      );
      setInfo("Notification marked as read.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark notification as read.");
    } finally {
      setBusy(false);
    }
  }

  async function onMarkAllRead() {
    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      const updated = await markAllNotificationsRead(category === "ALL" ? undefined : [category]);
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
      setInfo(`${updated} notification(s) marked as read.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark notifications as read.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Review priority, delivery channels, and status across your visible notification stream."
        actions={
          <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary">
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      <ComposePanel />

      <section className="teal-glow-card space-y-4 p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
          <div>
            <label htmlFor="notification-category-filter" className="text-sm text-white/78">Category</label>
            <select
              id="notification-category-filter"
              value={category}
              onChange={(event) => setCategory(event.target.value as "ALL" | NotificationCategory)}
              className="select-glass mt-1"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="notification-type-filter" className="text-sm text-white/78">Priority</label>
            <select
              id="notification-type-filter"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
              className="select-glass mt-1"
            >
              <option value="ALL">All priorities</option>
              <option value="NORMAL">Normal</option>
              <option value="EMERGENCY">Emergency</option>
            </select>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.52)] px-3 text-sm text-white/78">
            <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
            Unread only
          </label>
          <button type="button" onClick={() => void onMarkAllRead()} disabled={busy || visibleItems.length === 0} className="btn-primary disabled:opacity-60">
            Mark all read
          </button>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}
        {info ? <div className="info-banner">{info}</div> : null}
      </section>

      <section className="space-y-3">
        {loading ? (
          <>
            <NotificationSkeleton />
            <NotificationSkeleton />
            <NotificationSkeleton />
          </>
        ) : visibleItems.length === 0 ? (
          <div className="teal-glow-card p-6">
            <div className="text-lg font-semibold text-white">No notifications yet</div>
            <div className="mt-2 text-sm leading-6 text-white/72">
              Nothing matches the current filters. New app notifications will appear here with priority and channel metadata.
            </div>
          </div>
        ) : (
          visibleItems.map((notification) => {
            const type = normalizeType(notification);
            const channels = getChannels(notification);
            const unread = !notification.isRead;

            return (
              <article
                key={notification.id}
                className={[
                  "teal-glow-card p-5 transition",
                  type === "emergency"
                    ? "border-[rgba(255,94,130,0.34)] bg-[rgba(74,10,31,0.42)] shadow-[0_0_24px_rgba(255,94,130,0.12)]"
                    : "",
                  unread ? "ring-1 ring-[rgba(140,235,255,0.20)]" : "opacity-82",
                ].join(" ")}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeBadge type={type} />
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/64">
                        {notification.category}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/64">
                        {getStatus(notification)}
                      </span>
                      {unread ? (
                        <span className="rounded-full border border-[rgba(140,235,255,0.20)] bg-[rgba(140,235,255,0.10)] px-2.5 py-1 text-[11px] font-semibold text-[#8CEBFF]">
                          UNREAD
                        </span>
                      ) : null}
                    </div>

                    <h2 className="mt-3 text-lg font-semibold text-white">{notification.title}</h2>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/74">{notification.body}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {channels.map((channel) => (
                        <ChannelBadge key={`${notification.id}-${channel}`} channel={channel} />
                      ))}
                    </div>

                    <div className="mt-3 text-xs text-white/50">{formatDate(notification.createdAt)}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void onMarkRead(notification.id)}
                    disabled={busy || !unread}
                    className="btn-secondary w-full disabled:opacity-60 sm:w-auto"
                  >
                    {unread ? "Mark read" : "Read"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
