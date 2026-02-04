import type { Announcement } from "../lib/types";

export default function AnnouncementCard({ a }: { a: Announcement }) {
  return (
    <div
      className={[
        "rounded-2xl border border-slate-800 bg-slate-950/40 p-5",
        a.channel === "emergency" ? "border-red-500/30 bg-red-950/20" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
          {a.channel[0].toUpperCase() + a.channel.slice(1)}
        </span>
        {a.pinned && (
          <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-200">
            Pinned
          </span>
        )}
      </div>

      <div className="mt-3 text-lg font-semibold">{a.title}</div>
      <div className="mt-2 text-slate-300">{a.body}</div>

      <div className="mt-4 text-xs text-slate-500">
        {a.author} • {new Date(a.createdAt).toLocaleString()}
      </div>
    </div>
  );
}
