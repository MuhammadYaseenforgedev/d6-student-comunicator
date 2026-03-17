import { useMemo, useState, type FormEvent } from "react";
import type { UploadScope } from "../lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  scope: UploadScope;
  onUpload: (file: File) => Promise<void>;
};

export default function UploadModal({
  open,
  onClose,
  scope,
  onUpload,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => {
    return scope === "LECTURER_MATERIAL"
      ? "Upload Lecturer File"
      : "Submit Student File";
  }, [scope]);

  const helper = useMemo(() => {
    return scope === "LECTURER_MATERIAL"
      ? "Visible to students and lecturers."
      : "Visible to lecturers and admin. Students can still see their own submissions.";
  }, [scope]);

  if (!open) return null;

  async function submit(e: FormEvent<HTMLFormElement>) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass-panel-strong w-full max-w-lg p-5 text-white shadow-[0_0_28px_rgba(140,235,255,0.12),0_20px_45px_rgba(3,10,28,0.46)]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold text-white">{title}</div>

          <button
            onClick={onClose}
            type="button"
            className="btn-secondary px-3 py-1 text-sm"
            title="Close upload modal"
            aria-label="Close upload modal"
          >
            Close
          </button>
        </div>

        <p className="mt-2 text-sm text-white/72">{helper}</p>

        {error && <div className="error-banner mt-4">{error}</div>}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="rounded-2xl border border-[#8CEBFF]/18 bg-[rgba(8,18,48,0.62)] p-3 backdrop-blur-xl">
            <label
              htmlFor="upload-modal-file"
              className="block text-sm font-medium text-white/82"
            >
              Choose file
            </label>

            <input
              id="upload-modal-file"
              name="uploadFile"
              type="file"
              className="mt-2 w-full text-sm text-white file:mr-4 file:rounded-xl file:border file:border-[#8CEBFF]/20 file:bg-[rgba(15,31,78,0.88)] file:px-4 file:py-2 file:text-white file:transition-all file:duration-200 hover:file:border-[#8CEBFF]/34 hover:file:bg-[rgba(20,42,99,0.90)]"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-label="Choose file to upload"
              title="Choose file to upload"
            />

            <div className="mt-2 text-xs text-white/60">
              {file ? (
                <>
                  Selected:{" "}
                  <span className="font-medium text-white">{file.name}</span> (
                  {Math.round(file.size / 1024)} KB)
                </>
              ) : (
                "No file selected."
              )}
            </div>
          </div>

          <button
            disabled={busy || !file}
            type="submit"
            className="btn-primary w-full"
            title="Upload selected file"
            aria-label="Upload selected file"
          >
            {busy ? "Uploading..." : "Upload"}
          </button>
        </form>
      </div>
    </div>
  );
}