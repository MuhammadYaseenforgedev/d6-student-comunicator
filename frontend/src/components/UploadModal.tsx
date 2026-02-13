import { useMemo, useState } from "react";
import type { UploadScope } from "../lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  scope: UploadScope;
  onUpload: (file: File) => Promise<void>;
};

export default function UploadModal({ open, onClose, scope, onUpload }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => {
    return scope === "LECTURER_MATERIAL" ? "Upload Lecturer File" : "Submit Student File";
  }, [scope]);

  const helper = useMemo(() => {
    return scope === "LECTURER_MATERIAL"
      ? "Visible to students and lecturers."
      : "Visible to lecturers (and admin). Students can still see their own submissions.";
  }, [scope]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Please choose a file.");
      return;
    }

    setBusy(true);
    try {
      await onUpload(file);
      setFile(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
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

        <p className="mt-2 text-sm text-slate-600">{helper}</p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input
              type="file"
              className="w-full text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="mt-2 text-xs text-slate-500">
              {file ? (
                <>
                  Selected: <span className="font-medium text-slate-700">{file.name}</span>{" "}
                  ({Math.round(file.size / 1024)} KB)
                </>
              ) : (
                "No file selected."
              )}
            </div>
          </div>

          <button
            disabled={busy || !file}
            type="submit"
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Uploading..." : "Upload"}
          </button>
        </form>
      </div>
    </div>
  );
}
