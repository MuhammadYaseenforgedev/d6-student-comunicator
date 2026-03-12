// src/components/AnnouncementCard.tsx
// Announcement display card.
// Responsibilities:
// - Show channel badge, title, body, author, and created date
// - Allow privileged users to edit or delete announcements
// - Keep card actions visually aligned with the shared app button system
// - Give each channel its own light background identity

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

/**
 * Shared badge base style.
 */
function badgeBase() {
  return "rounded-full border px-2.5 py-0.5 text-xs font-medium";
}

/**
 * Channel-specific badge styling.
 */
function channelBadge(channel: string) {
  const base = badgeBase();

  if (channel === "modules") {
    return `${base} border-[#4EC2F3]/30 bg-[#4EC2F3]/15 text-black`;
  }

  if (channel === "faculty") {
    return `${base} border-[#70ECE4]/35 bg-[#7EF3E3]/18 text-black`;
  }

  if (channel === "clubs") {
    return `${base} border-[#794DFA]/25 bg-[#794DFA]/12 text-black`;
  }

  if (channel === "emergency") {
    return `${base} border-red-300 bg-red-50 text-black`;
  }

  return `${base} border-[#49BCF3]/25 bg-[#49BCF3]/10 text-black`;
}

/**
 * Card styling per channel.
 * This is the main visual identity change for each section.
 */
function channelCardClass(channel: string) {
  if (channel === "modules") {
    return "border-[#4EC2F3]/35 bg-[#4EC2F3]/10 hover:border-[#4EC2F3]/55 hover:bg-[#4EC2F3]/16";
  }

  if (channel === "faculty") {
  return "border-[#70ECE4]/50 bg-[#7EF3E3]/20 hover:border-[#70ECE4]/70 hover:bg-[#7EF3E3]/30";
  }

  if (channel === "clubs") {
    return "border-[#794DFA]/28 bg-[#794DFA]/10 hover:border-[#794DFA]/45 hover:bg-[#794DFA]/14";
  }

  if (channel === "emergency") {
    return "border-red-300 bg-red-50 hover:border-red-400 hover:bg-red-100/70";
  }

  return "border-[#49BCF3]/28 bg-white hover:border-[#49BCF3]/45 hover:bg-[#49BCF3]/08";
}

export default function AnnouncementCard({
  a,
  canManage = false,
  onUpdate,
  onDelete,
}: Props) {
  // Local edit state
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(a.title);
  const [body, setBody] = useState(a.body);
  const [pinned, setPinned] = useState(a.pinned);

  // Busy and error state for save/delete actions
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  /**
   * Keep local form fields synced with incoming announcement data,
   * but avoid overwriting while actively editing.
   */
  useEffect(() => {
    if (editing) return;
    setTitle(a.title);
    setBody(a.body);
    setPinned(a.pinned);
  }, [a.body, a.pinned, a.title, editing]);

  /**
   * Save edited announcement values.
   */
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

  /**
   * Delete the current announcement.
   */
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

  /**
   * Cancel edit mode and restore original values.
   */
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
        "rounded-3xl border p-5 transition-all duration-200",
        "hover:-translate-y-[1px] hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]",
        channelCardClass(a.channel),
      ].join(" ")}
    >
      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={channelBadge(a.channel)}>
          {a.channel[0].toUpperCase() + a.channel.slice(1)}
        </span>

        {(editing ? pinned : a.pinned) && (
          <span
            className={`${badgeBase()} border-yellow-300 bg-yellow-100 text-black`}
          >
            Pinned
          </span>
        )}
      </div>

      {/* Edit form */}
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

          <label className="inline-flex items-center gap-2 text-sm text-black">
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
        /* Read-only display */
        <div className="mt-4">
          <div className="text-lg font-semibold tracking-tight text-black">
            {a.title}
          </div>

          <div className="mt-2 text-sm leading-relaxed text-black">
            {a.body}
          </div>
        </div>
      )}

      {/* Meta information */}
      <div className="mt-5 flex items-center justify-between gap-4 text-xs text-black">
        <div className="truncate">{a.author}</div>
        <div className="shrink-0">{new Date(a.createdAt).toLocaleString()}</div>
      </div>

      {/* Management actions */}
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