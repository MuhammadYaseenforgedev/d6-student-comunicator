import { useMemo, useState } from "react";
import type { AnnouncementCreate, ChannelKey } from "../lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultChannel: ChannelKey;
  onCreate: (payload: AnnouncementCreate) => void | Promise<void>;
};

export default function NewAnnouncementModal({
  open,
  onClose,
  defaultChannel,
  onCreate,
}: Props) {
  const channels = useMemo<ChannelKey[]>(
    () => ["general", "modules", "faculty", "clubs", "emergency"],
    []
  );

  const [channel, setChannel] = useState<ChannelKey>(defaultChannel);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const titleOk = title.trim().length >= 3;
  const bodyOk = body.trim().length >= 5;
  const canSubmit = titleOk && bodyOk && !submitting;

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
      });

      // reset
      setTitle("");
      setBody("");
      setPinned(false);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onBackdropClick}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">New announcement</h2>
            <p className="mt-1 text-sm text-slate-400">
              Post an update to a channel. Keep it clear and short.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-1 text-sm hover:bg-slate-900/60"
          >
            Close
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-slate-300">Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as ChannelKey)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
              >
                {channels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-300 sm:mt-6">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              Pin announcement
            </label>
          </div>

          <div>
            <label className="text-sm text-slate-300">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="e.g. Test moved to Friday"
              required
            />
            {!titleOk && title.length > 0 && (
              <div className="mt-1 text-xs text-slate-500">Min 3 characters.</div>
            )}
          </div>

          <div>
            <label className="text-sm text-slate-300">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
              rows={5}
              placeholder="Write the details students need..."
              required
            />
            {!bodyOk && body.length > 0 && (
              <div className="mt-1 text-xs text-slate-500">Min 5 characters.</div>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className={[
              "w-full rounded-lg py-2 font-semibold transition",
              canSubmit ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-800 text-slate-400",
            ].join(" ")}
          >
            {submitting ? "Posting..." : "Create"}
          </button>
        </form>
      </div>
    </div>
  );
}
