// src/pages/Uploads1.tsx
// Uploads page.
// Responsibilities:
// - Allow eligible users to upload files
// - List uploaded files the current user can access
// - Support download for visible files
// - Support delete for lecturer/admin roles
// - Keep styling aligned with the shared light theme

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import type { UploadKind, UploadRecord } from "../lib/types";
import {
  deleteUpload,
  downloadUpload,
  listUploads,
  uploadFile,
} from "../api/uploads";

/**
 * Convert byte count into a human-readable KB / MB string.
 */
function prettySize(bytes: number) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function Uploads1() {
  const user = getUser();
  const role = user?.role ?? "STUDENT";
  const email = (user?.email ?? "dev@local").trim().toLowerCase();

  const canUpload =
    role === "STUDENT" || role === "LECTURER" || role === "ADMIN";
  const canDelete = role === "LECTURER" || role === "ADMIN";

  const uploadKind: UploadKind =
    role === "STUDENT" ? "STUDENT_SUBMISSION" : "LECTURER_MATERIAL";

  const [items, setItems] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  /**
   * Load all uploads visible to the current user.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const rows = await listUploads();
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load uploads");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Subtitle changes based on current role permissions.
   */
  const subtitle = useMemo(() => {
    if (canDelete) return "Upload and share lecturer materials.";
    if (canUpload)
      return "Upload your submission and view shared lecturer materials.";
    return "View and download shared lecturer materials.";
  }, [canDelete, canUpload]);

  /**
   * Upload the selected file using the role-derived upload kind.
   */
  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!canUpload) {
      setError("Only students, lecturers, or admin can upload.");
      return;
    }

    if (!file) {
      setError("Please choose a file first.");
      return;
    }

    setBusy(true);

    try {
      await uploadFile({ file, kind: uploadKind });
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Delete an upload by id.
   */
  async function onDelete(uploadId: string) {
    if (!canDelete) return;

    setError(null);
    setDeletingId(uploadId);

    try {
      await deleteUpload({ uploadId });
      setItems((prev) => prev.filter((u) => u.id !== uploadId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete upload");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <PageHeader title="Uploads" subtitle={subtitle} />

      <div
        className={`mt-6 grid grid-cols-1 gap-6 ${
          canUpload ? "lg:grid-cols-[420px_1fr]" : ""
        }`}
      >
        {/* Upload form panel */}
        {canUpload && (
          <div className="glass-panel border-[#794DFA]/20 bg-[#794DFA]/08 p-5">
            <div className="text-lg font-semibold text-black">
              Upload a file
            </div>
            <div className="mt-1 text-sm text-black">
              {uploadKind === "STUDENT_SUBMISSION"
                ? "Student submissions are visible to staff and to you."
                : "Saved to backend (disk) + metadata in PostgreSQL."}
            </div>

            <form onSubmit={onUpload} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="upload-kind"
                  className="block text-sm text-black"
                >
                  Type
                </label>
                <input
                  id="upload-kind"
                  value={
                    uploadKind === "STUDENT_SUBMISSION"
                      ? "Student submission"
                      : "Lecturer material"
                  }
                  readOnly
                  className="input-glass mt-2 text-black"
                  aria-label="Upload type"
                  title="Upload type"
                />
              </div>

              <div>
                <label
                  htmlFor="upload-file"
                  className="block text-sm text-black"
                >
                  File
                </label>
                <input
                  id="upload-file"
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-sm text-black file:mr-4 file:rounded-xl file:border file:border-[#DADDE2] file:bg-white file:px-4 file:py-2 file:text-black file:transition-all file:duration-200 hover:file:border-[#794DFA]/35 hover:file:bg-[#794DFA]/08"
                  disabled={busy}
                  aria-label="Choose file to upload"
                  title="Choose file to upload"
                />
              </div>

              {error && <div className="error-banner">{error}</div>}

              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full"
                title="Upload selected file"
                aria-label="Upload selected file"
              >
                {busy ? "Uploading..." : "Upload"}
              </button>
            </form>
          </div>
        )}

        {/* File list panel */}
        <div className="glass-panel border-[#794DFA]/20 bg-[#794DFA]/08 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-black">Files</div>
              <div className="mt-1 text-sm text-black">
                {canDelete
                  ? "You can see all uploads."
                  : canUpload
                  ? "You can view staff uploads and your own submissions."
                  : "You can view materials your role is allowed to access."}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              className="btn-secondary"
              title="Refresh uploads"
              aria-label="Refresh uploads"
            >
              Refresh
            </button>
          </div>

          {!canUpload && error && <div className="error-banner mt-4">{error}</div>}

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="text-black">Loading...</div>
            ) : items.length === 0 ? (
              <div className="rounded-3xl border border-[#794DFA]/18 bg-white p-6 text-black">
                No files yet.
              </div>
            ) : (
              items.map((u) => (
                <div
                  key={u.id}
                  className="rounded-3xl border border-[#794DFA]/20 bg-white p-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[#794DFA]/40 hover:bg-[#794DFA]/06 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-black">
                        {u.fileName}
                      </div>

                      <div className="mt-1 text-xs text-black">
                        {u.kind === "LECTURER_MATERIAL"
                          ? "Lecturer material"
                          : "Student submission"}{" "}
                        - {prettySize(u.size)} -{" "}
                        {new Date(u.uploadedAt).toLocaleString()}
                      </div>

                      <div className="mt-1 text-xs text-black">
                        Uploaded by: {u.uploaderEmail}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void downloadUpload({
                            uploadId: u.id,
                            fileName: u.fileName,
                          })
                        }
                        className="btn-primary px-3 py-2 text-xs"
                        title={`Download ${u.fileName}`}
                        aria-label={`Download ${u.fileName}`}
                      >
                        Download
                      </button>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void onDelete(u.id)}
                          disabled={deletingId === u.id}
                          className="btn-danger px-3 py-2 text-xs disabled:opacity-60"
                          title={`Delete ${u.fileName}`}
                          aria-label={`Delete ${u.fileName}`}
                        >
                          {deletingId === u.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 text-xs text-black">
            Logged in as: {email} ({role})
          </div>
        </div>
      </div>
    </div>
  );
}