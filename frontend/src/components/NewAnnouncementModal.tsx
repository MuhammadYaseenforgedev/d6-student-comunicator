import { useMemo, useState } from "react";
import type { Announcement, ChannelKey } from "../lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  initialChannel: ChannelKey;
  onCreate: (payload: Omit<Announcement, "id" | "createdAt">) => void;
};

export default function NewAnnouncementModal({
  open,
  onClose,
  initialChannel,
  onCreate,
}: Props) {
  const channels = useMemo<ChannelKey[]>(
    () => ["general", "modules", "faculty", "clubs", "emergency"],
    []
  );

  const [channel, setChannel] = useState<ChannelKey>(initialChannel);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();

    onCreate({
      channel,
      title: title.trim(),
      body: body.trim(),
      pinned,
      author: "Dev User",
    });

    setTitle("");
    setBody("");
    setPinned(false);
    setChannel(initialChannel);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">New announcement</div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-1 text-sm hover:bg-slate-900/50"
          >
            Close
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label className="text-sm text-slate-300">Channel</label>
            <select
              className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2"
              value={channel}
              onChange={(e) => setChannel(e.target.value as ChannelKey)}
            >
              {channels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-300">Title</label>
            <input
              className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-sm text-slate-300">Body</label>
            <textarea
              className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            Pin this announcement
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 py-2 font-semibold hover:bg-blue-700"
          >
            Create
          </button>
        </form>
      </div>
    </div>
  );
}
