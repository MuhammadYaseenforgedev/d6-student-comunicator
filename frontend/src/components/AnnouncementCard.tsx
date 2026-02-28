import { useEffect, useState } from "react";
import type { Announcement } from "../lib/types";

type Props = {
  a: Announcement;
  canManage?: boolean;
  onUpdate?: (
    id: string,
    patch: { title?: string; body?: string; pinned?: boolean }
  ) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
};

function badgeBase() {
  return "rounded-full border px-2.5 py-0.5 text-xs font-medium";
}

function channelBadge(channel: string) {
  const base = badgeBase();
  if (channel === "emergency")
    return `${base} border-red-500/30 bg-red-500/10 text-red-100`;
  return `${base} border-slate-700 bg-slate-900/40 text-slate-200`;
}

export default function AnnouncementCard({ a, canManage = false, onUpdate, onDelete }: Props) {
  const isEmergency = a.channel === "emergency";
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(a.title);
  const [body, setBody] = useState(a.body);
  const [pinned, setPinned] = useState(a.pinned);
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) return;
    setTitle(a.title);
    setBody(a.body);
    setPinned(a.pinned);
  }, [a.body, a.pinned, a.title, editing]);

  async function save() {
    if (!onUpdate) return;
    const nextTitle = title.trim();
    const nextBody = body.trim();

    if (!nextTitle) {
      setEditError("Title is required.");
      return;
    }
    if (!nextBody) {
      setEditError("Body is required.");
      return;
    }

    setBusy(true);
    setEditError(null);
    try {
      await onUpdate(a.id, { title: nextTitle, body: nextBody, pinned });
      setEditing(false);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    setBusy(true);
    setEditError(null);
    try {
      await onDelete(a.id);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to delete announcement");
    } finally {
      setBusy(false);
    }
  }

  function cancelEdit() {
    setTitle(a.title);
    setBody(a.body);
    setPinned(a.pinned);
    setEditError(null);
    setEditing(false);
  }

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

        {(editing ? pinned : a.pinned) && (
          <span className={`${badgeBase()} border-yellow-500/30 bg-yellow-500/10 text-yellow-100`}>
            Pinned
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600"
          />
          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            Pin announcement
          </label>
          {editError && (
            <div className="rounded-xl border border-red-700/40 bg-red-950/30 p-2 text-xs text-red-200">
              {editError}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <div className="text-lg font-semibold tracking-tight text-white">{a.title}</div>
          <div className="mt-2 text-sm leading-relaxed text-slate-300">{a.body}</div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-4 text-xs text-slate-500">
        <div className="truncate">{a.author}</div>
        <div className="shrink-0">{new Date(a.createdAt).toLocaleString()}</div>
      </div>

      {canManage && (
        <div className="mt-4 flex flex-wrap gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={busy}
                className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="rounded-lg border border-red-700/40 bg-red-950/30 px-3 py-2 text-xs text-red-200 hover:bg-red-950/50 disabled:opacity-60"
              >
                {busy ? "Deleting..." : "Delete"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
