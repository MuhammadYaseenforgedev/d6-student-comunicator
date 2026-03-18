// src/pages/Uploads1.tsx
// Uploads page.
// Responsibilities:
// - Allow eligible users to upload files
// - List uploaded files the current user can access
// - Support download for visible files
// - Support delete for lecturer/admin roles
// - Keep styling aligned with the shared neon glass theme

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import type { UploadKind, UploadRecord } from "../lib/types";
import {
  deleteUpload,
  downloadUpload,
  listUploadAssignableUsers,
  listUploads,
  type UploadAssignableUser,
  uploadFile,
} from "../api/uploads";

function prettySize(bytes: number) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function kindLabel(kind: UploadKind): string {
  return kind === "STUDENT_SUBMISSION"
    ? "Student submission"
    : "Lecturer material";
}

export default function Uploads1() {
  const user = getUser();
  const role = user?.role ?? "STUDENT";
  const email = (user?.email ?? "dev@local").trim().toLowerCase();
  const isAdmin = role === "ADMIN";
  const canUpload =
    role === "STUDENT" || role === "LECTURER" || role === "ADMIN";
  const canDelete = role === "LECTURER" || role === "ADMIN";
  const [uploadKind, setUploadKind] = useState<UploadKind>(
    role === "STUDENT" ? "STUDENT_SUBMISSION" : "LECTURER_MATERIAL"
  );

  const [items, setItems] = useState<UploadRecord[]>([]);
  const [studentTargets, setStudentTargets] = useState<UploadAssignableUser[]>(
    []
  );
  const [lecturerTargets, setLecturerTargets] = useState<
    UploadAssignableUser[]
  >([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

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

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      try {
        const [students, lecturers] = await Promise.all([
          listUploadAssignableUsers(["STUDENT"]),
          listUploadAssignableUsers(["LECTURER"]),
        ]);
        setStudentTargets(students);
        setLecturerTargets(lecturers);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load upload targets");
      }
    })();
  }, [isAdmin]);

  const targetOptions =
    uploadKind === "STUDENT_SUBMISSION" ? studentTargets : lecturerTargets;

  useEffect(() => {
    if (!isAdmin) return;
    setTargetUserId((current) =>
      targetOptions.some((option) => option.id === current)
        ? current
        : (targetOptions[0]?.id ?? "")
    );
  }, [isAdmin, targetOptions]);

  const subtitle = useMemo(() => {
    if (isAdmin) {
      return "Upload lecturer materials or student submissions for a selected lecturer or student.";
    }
    if (canDelete) return "Upload and share lecturer materials.";
    if (canUpload) {
      return "Upload your submission and view shared lecturer materials.";
    }
    return "View and download shared lecturer materials.";
  }, [canDelete, canUpload, isAdmin]);

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

    if (isAdmin && !targetUserId) {
      setError(
        uploadKind === "STUDENT_SUBMISSION"
          ? "Select a student first."
          : "Select a lecturer first."
      );
      return;
    }

    setBusy(true);

    try {
      await uploadFile({
        file,
        kind: uploadKind,
        targetUserId: isAdmin ? targetUserId : undefined,
      });
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

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
        {canUpload && (
          <div className="teal-glow-card p-5">
            <div className="text-lg font-semibold text-white">
              Upload a file
            </div>
            <div className="mt-1 text-sm text-white/72">
              {uploadKind === "STUDENT_SUBMISSION"
                ? isAdmin
                  ? "Student submissions are visible to staff and to the selected student."
                  : "Student submissions are visible to staff and to you."
                : isAdmin
                  ? "Saved to backend (disk) + metadata in PostgreSQL, assigned to the selected lecturer."
                  : "Saved to backend (disk) + metadata in PostgreSQL."}
            </div>

            <form onSubmit={onUpload} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="upload-kind"
                  className="block text-sm text-white/80"
                >
                  Type
                </label>
                {isAdmin ? (
                  <select
                    id="upload-kind"
                    value={uploadKind}
                    onChange={(e) => setUploadKind(e.target.value as UploadKind)}
                    disabled={busy}
                    className="select-glass mt-2"
                    aria-label="Upload type"
                    title="Upload type"
                  >
                    <option value="LECTURER_MATERIAL">Lecturer material</option>
                    <option value="STUDENT_SUBMISSION">
                      Student submission
                    </option>
                  </select>
                ) : (
                  <input
                    id="upload-kind"
                    value={kindLabel(uploadKind)}
                    readOnly
                    className="input-glass mt-2"
                    aria-label="Upload type"
                    title="Upload type"
                  />
                )}
              </div>

              {isAdmin && (
                <div>
                  <label
                    htmlFor="upload-target"
                    className="block text-sm text-white/80"
                  >
                    {uploadKind === "STUDENT_SUBMISSION"
                      ? "For student"
                      : "For lecturer"}
                  </label>
                  <select
                    id="upload-target"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    disabled={busy || targetOptions.length === 0}
                    className="select-glass mt-2"
                    aria-label="Upload target"
                    title="Upload target"
                  >
                    {targetOptions.length === 0 ? (
                      <option value="">
                        {uploadKind === "STUDENT_SUBMISSION"
                          ? "No students available"
                          : "No lecturers available"}
                      </option>
                    ) : (
                      targetOptions.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.email}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {isAdmin && targetOptions.length === 0 && (
                <div className="rounded-2xl border border-[rgba(255,196,87,0.24)] bg-[rgba(97,59,9,0.45)] p-3 text-sm text-[#ffe8b0]">
                  {uploadKind === "STUDENT_SUBMISSION"
                    ? "Create or register a student account first."
                    : "Create or register a lecturer account first."}
                </div>
              )}

              <div>
                <label
                  htmlFor="upload-file"
                  className="block text-sm text-white/80"
                >
                  File
                </label>
                <input
                  id="upload-file"
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-sm text-white file:mr-4 file:rounded-xl file:border file:file:border-[rgba(140,235,255,0.18)] file:file:bg-[rgba(8,18,48,0.86)] file:file:px-4 file:file:py-2 file:file:text-white file:file:transition-all file:file:duration-200 hover:file:file:border-[rgba(140,235,255,0.34)] hover:file:file:bg-[rgba(14,42,99,0.75)]"
                  disabled={busy}
                  aria-label="Choose file to upload"
                  title="Choose file to upload"
                />
              </div>

              {error && <div className="error-banner">{error}</div>}

              <button
                type="submit"
                disabled={busy || (isAdmin && targetOptions.length === 0)}
                className="btn-primary w-full"
                title="Upload selected file"
                aria-label="Upload selected file"
              >
                {busy ? "Uploading..." : "Upload"}
              </button>
            </form>
          </div>
        )}

        <div className="teal-glow-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Files</div>
              <div className="mt-1 text-sm text-white/72">
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
              <div className="text-white/75">Loading...</div>
            ) : items.length === 0 ? (
              <div className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-6 text-white/80">
                No files yet.
              </div>
            ) : (
              items.map((u) => (
                <div
                  key={u.id}
                  className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.34)] hover:bg-[rgba(14,42,99,0.62)] hover:shadow-[0_0_18px_rgba(140,235,255,0.10)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">
                        {u.fileName}
                      </div>

                      <div className="mt-1 text-xs text-white/70">
                        {kindLabel(u.kind)} - {prettySize(u.size)} -{" "}
                        {new Date(u.uploadedAt).toLocaleString()}
                      </div>

                      <div className="mt-1 text-xs text-white/60">
                        Uploaded by: {u.uploaderEmail}
                      </div>
                      {u.targetUserEmail && (
                        <div className="mt-1 text-xs text-white/60">
                          For: {u.targetUserEmail}
                          {u.targetUserRole
                            ? ` (${u.targetUserRole.toLowerCase()})`
                            : ""}
                        </div>
                      )}
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

          <div className="mt-4 text-xs text-white/60">
            Logged in as: {email} ({role})
          </div>
        </div>
      </div>
    </div>
  );
}
