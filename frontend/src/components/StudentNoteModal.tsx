// src/components/StudentNoteModal.tsx
import { useMemo, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  date: string;
  eventTitle?: string;
  onCreate: (body: string) => Promise<void> | void;
};

export default function StudentNoteModal({
  open,
  onClose,
  date,
  eventTitle,
  onCreate,
}: Props) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass-panel-strong w-full max-w-lg p-5 text-white shadow-[0_0_28px_rgba(140,235,255,0.12),0_20px_45px_rgba(3,10,28,0.46)]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold text-white">{title}</div>
          <button
            onClick={onClose}
            type="button"
            className="btn-secondary px-3 py-1 text-sm"
            title="Close note modal"
            aria-label="Close note modal"
          >
            Close
          </button>
        </div>

        <p className="mt-2 text-sm text-white/72">
          Notes are personal. Only you can see them. You cannot edit the campus
          calendar.
        </p>

        {error && <div className="error-banner mt-4">{error}</div>}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="student-note-body"
              className="block text-sm text-white/82"
            >
              Note
            </label>
            <textarea
              id="student-note-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="input-glass mt-2"
              placeholder="Write your note..."
              aria-label="Student note"
              title="Student note"
            />
          </div>

          <button
            disabled={busy}
            type="submit"
            className="btn-primary w-full"
            title="Save note"
            aria-label="Save note"
          >
            {busy ? "Saving..." : "Save note"}
          </button>
        </form>
      </div>
    </div>
  );
}