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

type DurationValue = "1" | "3" | "7" | "14" | "30" | "custom";

const DAY_MS = 24 * 60 * 60 * 1000;
const durationOptions: Array<{ value: DurationValue; label: string; days?: number }> = [
  { value: "1", label: "1 day", days: 1 },
  { value: "3", label: "3 days", days: 3 },
  { value: "7", label: "7 days", days: 7 },
  { value: "14", label: "14 days", days: 14 },
  { value: "30", label: "30 days", days: 30 },
  { value: "custom", label: "Custom date/time" },
];

function toLocalDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
  const [duration, setDuration] = useState<DurationValue>("7");
  const [customExpiresAt, setCustomExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChannel(defaultChannel);
    setModuleId(defaultModuleId ?? "");
    setTitle("");
    setBody("");
    setPinned(false);
    setDuration("7");
    setCustomExpiresAt(toLocalDateTimeValue(new Date(Date.now() + 7 * DAY_MS)));
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

  // Lightweight form validation
  const titleOk = title.trim().length >= 3;
  const bodyOk = body.trim().length >= 5;
  const needsModule =
    channel === "modules" && (requireModuleSelection || moduleOptions.length > 0);
  const moduleOk = !needsModule || Boolean(moduleId);
  const resolvedExpiry = useMemo(() => {
    if (duration === "custom") {
      if (!customExpiresAt.trim()) {
        return {
          iso: "",
          label: "",
          error: "Choose when this announcement should expire.",
        };
      }

      const parsed = new Date(customExpiresAt);
      const parsedTime = parsed.getTime();
      if (!Number.isFinite(parsedTime)) {
        return {
          iso: "",
          label: "",
          error: "Enter a valid custom expiry date and time.",
        };
      }
      if (parsedTime <= Date.now()) {
        return {
          iso: "",
          label: "",
          error: "Expiry must be in the future.",
        };
      }

      return {
        iso: parsed.toISOString(),
        label: parsed.toLocaleString(),
        error: "",
      };
    }

    const selectedOption = durationOptions.find((option) => option.value === duration);
    const days = selectedOption?.days ?? 7;
    const expiresAt = new Date(Date.now() + days * DAY_MS);
    return {
      iso: expiresAt.toISOString(),
      label: expiresAt.toLocaleString(),
      error: "",
    };
  }, [customExpiresAt, duration]);
  const expiryOk = Boolean(resolvedExpiry.iso);
  const canSubmit = titleOk && bodyOk && moduleOk && expiryOk && !submitting;

  // Do not render anything if the modal is closed
  if (!open) return null;

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
        expiresAt: resolvedExpiry.iso,
        ...(channel === "modules" && moduleId ? { moduleId } : {}),
      });

      // Reset form after successful submission
      setTitle("");
      setBody("");
      setPinned(false);
      setDuration("7");
      setCustomExpiresAt(toLocalDateTimeValue(new Date(Date.now() + 7 * DAY_MS)));
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="announcement-duration"
                className="text-sm text-white/78"
              >
                Duration
              </label>
              <select
                id="announcement-duration"
                name="duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value as DurationValue)}
                className="select-glass mt-1"
                aria-label="Announcement duration"
                title="Announcement duration"
              >
                {durationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-white/78">Expires on</label>
              <div className="input-glass mt-1 flex min-h-[44px] items-center text-sm text-white/88">
                {resolvedExpiry.label || "Select a duration first"}
              </div>
            </div>
          </div>

          {duration === "custom" && (
            <div>
              <label
                htmlFor="announcement-custom-expires"
                className="text-sm text-white/78"
              >
                Custom expiry
              </label>
              <input
                id="announcement-custom-expires"
                name="customExpiresAt"
                type="datetime-local"
                value={customExpiresAt}
                onChange={(e) => setCustomExpiresAt(e.target.value)}
                min={toLocalDateTimeValue(new Date())}
                className="input-glass mt-1"
                aria-label="Announcement custom expiry"
                title="Announcement custom expiry"
              />
            </div>
          )}

          <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] px-4 py-3 text-sm text-white/74">
            Announcements go live as soon as they are posted and automatically stop showing after the expiry time.
          </div>

          {duration === "custom" && resolvedExpiry.error ? (
            <div className="mt-1 text-xs text-white/55">
              {resolvedExpiry.error}
            </div>
          ) : null}

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
