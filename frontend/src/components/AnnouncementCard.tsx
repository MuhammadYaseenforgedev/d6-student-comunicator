import type { Announcement } from "../lib/types";

function badgeBase() {
  return "rounded-full border px-2.5 py-0.5 text-xs font-medium";
}

function channelBadge(channel: string) {
  const base = badgeBase();
  if (channel === "emergency")
    return `${base} border-red-500/30 bg-red-500/10 text-red-100`;
  return `${base} border-slate-700 bg-slate-900/40 text-slate-200`;
}

export default function AnnouncementCard({ a }: { a: Announcement }) {
  const isEmergency = a.channel === "emergency";

  return (
    <div
      className={[
        "rounded-2xl border bg-slate-950/30 p-5 shadow-sm",
        "hover:bg-slate-950/45 transition-colors",
        isEmergency ? "border-red-500/25" : "border-slate-800",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={channelBadge(a.channel)}>
          {a.channel[0].toUpperCase() + a.channel.slice(1)}
        </span>

        {a.pinned && (
          <span className={`${badgeBase()} border-yellow-500/30 bg-yellow-500/10 text-yellow-100`}>
            Pinned
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="text-lg font-semibold tracking-tight text-white">
          {a.title}
        </div>
        <div className="mt-2 text-sm leading-relaxed text-slate-300">
          {a.body}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 text-xs text-slate-500">
        <div className="truncate">{a.author}</div>
        <div className="shrink-0">{new Date(a.createdAt).toLocaleString()}</div>
      </div>
    </div>
  );
}
