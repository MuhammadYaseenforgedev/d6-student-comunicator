// src/components/AnnouncementCard.tsx
// Announcement display card.
// Responsibilities:
// - Show channel badge, title, body, author, and created date
// - Allow privileged users to edit or delete announcements
// - Keep card actions visually aligned with the shared app button system
// - Give each channel its own neon glass identity

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

  if (channel === "modules") {
    return `${base} border-[#38D5FF]/80 bg-[#38D5FF]/20 text-white shadow-[0_0_12px_rgba(56,213,255,0.35)]`;
  }

  if (channel === "faculty") {
    return `${base} border-[#35FFE3]/80 bg-[#35FFE3]/18 text-white shadow-[0_0_12px_rgba(53,255,227,0.35)]`;
  }

  if (channel === "clubs") {
    return `${base} border-[#8C5BFF]/80 bg-[#8C5BFF]/18 text-white shadow-[0_0_12px_rgba(140,91,255,0.35)]`;
  }

  if (channel === "emergency") {
    return `${base} border-[#FF5E7E]/80 bg-[#FF5E7E]/18 text-white shadow-[0_0_12px_rgba(255,94,126,0.35)]`;
  }

  return `${base} border-[#4FA6FF]/80 bg-[#4FA6FF]/18 text-white shadow-[0_0_12px_rgba(79,166,255,0.35)]`;
}

function channelCardClass(channel: string) {
  if (channel === "modules") {
    return [
      "border-[#38D5FF]/75 bg-[#081A44]/72",
      "shadow-[0_0_0_1px_rgba(56,213,255,0.24),0_0_18px_rgba(56,213,255,0.24),0_12px_30px_rgba(2,12,42,0.55)]",
      "hover:border-[#38D5FF] hover:bg-[#0B204D]/80",
      "hover:shadow-[0_0_0_1px_rgba(56,213,255,0.36),0_0_26px_rgba(56,213,255,0.34),0_16px_36px_rgba(2,12,42,0.62)]",
    ].join(" ");
  }

  if (channel === "faculty") {
    return [
      "border-[#35FFE3]/75 bg-[#081A44]/72",
      "shadow-[0_0_0_1px_rgba(53,255,227,0.24),0_0_18px_rgba(53,255,227,0.22),0_12px_30px_rgba(2,12,42,0.55)]",
      "hover:border-[#35FFE3] hover:bg-[#0B204D]/80",
      "hover:shadow-[0_0_0_1px_rgba(53,255,227,0.36),0_0_26px_rgba(53,255,227,0.30),0_16px_36px_rgba(2,12,42,0.62)]",
    ].join(" ");
  }

  if (channel === "clubs") {
    return [
      "border-[#8C5BFF]/75 bg-[#081A44]/72",
      "shadow-[0_0_0_1px_rgba(140,91,255,0.24),0_0_18px_rgba(140,91,255,0.24),0_12px_30px_rgba(2,12,42,0.55)]",
      "hover:border-[#8C5BFF] hover:bg-[#0B204D]/80",
      "hover:shadow-[0_0_0_1px_rgba(140,91,255,0.36),0_0_26px_rgba(140,91,255,0.32),0_16px_36px_rgba(2,12,42,0.62)]",
    ].join(" ");
  }

  if (channel === "emergency") {
    return [
      "border-[#FF5E7E]/78 bg-[#081A44]/72",
      "shadow-[0_0_0_1px_rgba(255,94,126,0.24),0_0_18px_rgba(255,94,126,0.22),0_12px_30px_rgba(2,12,42,0.55)]",
      "hover:border-[#FF5E7E] hover:bg-[#0B204D]/80",
      "hover:shadow-[0_0_0_1px_rgba(255,94,126,0.36),0_0_26px_rgba(255,94,126,0.30),0_16px_36px_rgba(2,12,42,0.62)]",
    ].join(" ");
  }

  return [
    "border-[#4FA6FF]/75 bg-[#081A44]/72",
    "shadow-[0_0_0_1px_rgba(79,166,255,0.24),0_0_18px_rgba(79,166,255,0.22),0_12px_30px_rgba(2,12,42,0.55)]",
    "hover:border-[#4FA6FF] hover:bg-[#0B204D]/80",
    "hover:shadow-[0_0_0_1px_rgba(79,166,255,0.36),0_0_26px_rgba(79,166,255,0.30),0_16px_36px_rgba(2,12,42,0.62)]",
  ].join(" ");
}

export default function AnnouncementCard({
  a,
  canManage = false,
  onUpdate,
  onDelete,
}: Props) {
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
      setEditError(
        e instanceof Error ? e.message : "Failed to delete announcement"
      );
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
        "rounded-3xl border p-5 transition-all duration-200 backdrop-blur-xl",
        "hover:-translate-y-[1px]",
        channelCardClass(a.channel),
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={channelBadge(a.channel)}>
          {a.channel[0].toUpperCase() + a.channel.slice(1)}
        </span>

        {(editing ? pinned : a.pinned) && (
          <span
            className={`${badgeBase()} border-yellow-300/80 bg-yellow-300/20 text-white shadow-[0_0_12px_rgba(253,224,71,0.28)]`}
          >
            Pinned
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-glass"
            placeholder="Announcement title"
            aria-label="Announcement title"
            title="Announcement title"
          />

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="input-glass"
            placeholder="Announcement body"
            aria-label="Announcement body"
            title="Announcement body"
          />

          <label className="inline-flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            Pin announcement
          </label>

          {editError && <div className="error-banner text-xs">{editError}</div>}
        </div>
      ) : (
        <div className="mt-4">
          <div className="text-lg font-semibold tracking-tight text-white">
            {a.title}
          </div>

          <div className="mt-2 text-sm leading-relaxed text-white/88">
            {a.body}
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-4 text-xs text-white/72">
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
                className="btn-primary text-xs"
                title="Save announcement changes"
                aria-label="Save announcement changes"
              >
                {busy ? "Saving..." : "Save"}
              </button>

              <button
                type="button"
                onClick={cancelEdit}
                disabled={busy}
                className="btn-secondary text-xs"
                title="Cancel editing"
                aria-label="Cancel editing"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-secondary text-xs"
                title="Edit announcement"
                aria-label="Edit announcement"
              >
                Edit
              </button>

              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="btn-danger text-xs disabled:opacity-60"
                title="Delete announcement"
                aria-label="Delete announcement"
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