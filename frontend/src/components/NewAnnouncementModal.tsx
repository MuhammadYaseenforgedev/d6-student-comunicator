// src/components/NewAnnouncementModal.tsx
// Modal used to create a new announcement.
//
// Responsibilities:
// - Render a modal dialog over the current page
// - Allow the user to select a channel
// - Capture title, body, and pinned state
// - Validate minimum title/body lengths before submit
// - Submit the new announcement payload to the parent handler

import { useEffect, useMemo, useState } from "react";
import type { AnnouncementCreate, ChannelKey } from "../lib/types";

type ModuleOption = {
  id: string;
  label: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  defaultChannel: ChannelKey;
  onCreate: (payload: AnnouncementCreate) => void | Promise<void>;
  channelOptions?: ChannelKey[];
  lockChannel?: boolean;
  moduleOptions?: ModuleOption[];
  defaultModuleId?: string;
  requireModuleSelection?: boolean;
};

export default function NewAnnouncementModal({
  open,
  onClose,
  defaultChannel,
  onCreate,
  channelOptions,
  lockChannel = false,
  moduleOptions = [],
  defaultModuleId,
  requireModuleSelection = false,
}: Props) {
  /**
   * Supported announcement channels.
   * Memoized so the array is stable across renders.
   */
  const channels = useMemo<ChannelKey[]>(
    () => channelOptions ?? ["general", "modules", "faculty", "clubs", "emergency"],
    [channelOptions]
  );

  // Form state
  const [channel, setChannel] = useState<ChannelKey>(defaultChannel);
  const [moduleId, setModuleId] = useState(defaultModuleId ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChannel(defaultChannel);
    setModuleId(defaultModuleId ?? "");
    setTitle("");
    setBody("");
    setPinned(false);
    setSubmitting(false);
  }, [open, defaultChannel, defaultModuleId]);

  useEffect(() => {
    if (channel !== "modules") {
      setModuleId("");
      return;
    }

    if (moduleOptions.length === 0) {
      setModuleId("");
      return;
    }

    const fallbackModuleId = defaultModuleId ?? moduleOptions[0]?.id ?? "";
    if (!moduleOptions.some((option) => option.id === moduleId)) {
      setModuleId(fallbackModuleId);
    }
  }, [channel, defaultModuleId, moduleId, moduleOptions]);

  // Do not render anything if the modal is closed
  if (!open) return null;

  // Lightweight form validation
  const titleOk = title.trim().length >= 3;
  const bodyOk = body.trim().length >= 5;
  const needsModule =
    channel === "modules" && (requireModuleSelection || moduleOptions.length > 0);
  const moduleOk = !needsModule || Boolean(moduleId);
  const canSubmit = titleOk && bodyOk && moduleOk && !submitting;

  /**
   * Submit the form to create a new announcement.
   * Resets the form after a successful create.
   */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);

    try {
      await onCreate({
        channel,
        title: title.trim(),
        body: body.trim(),
        pinned,
        author: "Dev User",
        ...(channel === "modules" && moduleId ? { moduleId } : {}),
      });

      // Reset form after successful submission
      setTitle("");
      setBody("");
      setPinned(false);
      setModuleId(defaultModuleId ?? "");
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Close the modal if the user clicks on the dark backdrop.
   */
  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  /**
   * Close the modal when Escape is pressed.
   */
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#020C2A]/72 p-4 backdrop-blur-md"
      onMouseDown={onBackdropClick}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Create new announcement"
      tabIndex={-1}
    >
      {/* Modal panel */}
      <div className="glass-panel-strong w-full max-w-lg p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">New announcement</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-secondary px-3 py-1 text-sm"
            title="Close announcement modal"
            aria-label="Close announcement modal"
          >
            Close
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          {/* Channel + pinned row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="announcement-channel"
                className="text-sm text-white/78"
              >
                Channel
              </label>
              {lockChannel ? (
                <div className="input-glass mt-1 flex min-h-[44px] items-center capitalize">
                  {channel}
                </div>
              ) : (
                <select
                  id="announcement-channel"
                  name="channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as ChannelKey)}
                  className="select-glass mt-1"
                  aria-label="Announcement channel"
                  title="Announcement channel"
                >
                  {channels.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-white/78 sm:mt-6">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              Pin announcement
            </label>
          </div>

          {channel === "modules" && moduleOptions.length > 0 && (
            <div>
              <label
                htmlFor="announcement-module"
                className="text-sm text-white/78"
              >
                Module
              </label>
              <select
                id="announcement-module"
                name="moduleId"
                value={moduleId}
                onChange={(e) => setModuleId(e.target.value)}
                className="select-glass mt-1"
                aria-label="Announcement module"
                title="Announcement module"
              >
                <option value="">Select module</option>
                {moduleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              {!moduleOk && (
                <div className="mt-1 text-xs text-white/55">
                  Select the module this announcement belongs to.
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <div>
            <label
              htmlFor="announcement-title"
              className="text-sm text-white/78"
            >
              Title
            </label>
            <input
              id="announcement-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-glass mt-1"
              placeholder="e.g. Test moved to Friday"
              required
              aria-label="Announcement title"
              title="Announcement title"
            />
            {!titleOk && title.length > 0 && (
              <div className="mt-1 text-xs text-white/55">
                Min 3 characters.
              </div>
            )}
          </div>

          {/* Body */}
          <div>
            <label
              htmlFor="announcement-body"
              className="text-sm text-white/78"
            >
              Body
            </label>
            <textarea
              id="announcement-body"
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="input-glass mt-1"
              rows={5}
              placeholder="Write the details students need..."
              required
              aria-label="Announcement body"
              title="Announcement body"
            />
            {!bodyOk && body.length > 0 && (
              <div className="mt-1 text-xs text-white/55">
                Min 5 characters.
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary w-full"
            title="Create announcement"
            aria-label="Create announcement"
          >
            {submitting ? "Posting..." : "Create"}
          </button>
        </form>
      </div>
    </div>
  );
}
