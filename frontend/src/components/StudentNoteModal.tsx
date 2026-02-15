// src/components/StudentNoteModal.tsx
import { useMemo, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  date: string; // "YYYY-MM-DD"
  eventTitle?: string;
  onCreate: (body: string) => Promise<void> | void;
};

export default function StudentNoteModal({ open, onClose, date, eventTitle, onCreate }: Props) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => {
    if (eventTitle) return `Add note for: ${eventTitle}`;
    return `Add note for ${date}`;
  }, [date, eventTitle]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = body.trim();
    if (!trimmed) {
      setError("Please type a note.");
      return;
    }

    setBusy(true);
    try {
      await onCreate(trimmed);
      setBody("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">{title}</div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          Notes are personal (only you can see them). You cannot edit the campus calendar.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-600"
            placeholder="Write your note…"
          />

          <button
            disabled={busy}
            type="submit"
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save note"}
          </button>
        </form>
      </div>
    </div>
  );
}
