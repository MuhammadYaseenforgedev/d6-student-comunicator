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
  return kind === "STUDENT_SUBMISSION" ? "Student submission" : "Lecturer material";
}

export default function Uploads1() {
  const user = getUser();
  const role = user?.role ?? "STUDENT";
  const email = (user?.email ?? "dev@local").trim().toLowerCase();
  const isAdmin = role === "ADMIN";
  const canUpload = role === "STUDENT" || role === "LECTURER" || role === "ADMIN";
  const canDelete = role === "LECTURER" || role === "ADMIN";
  const [uploadKind, setUploadKind] = useState<UploadKind>(role === "STUDENT" ? "STUDENT_SUBMISSION" : "LECTURER_MATERIAL");

  const [items, setItems] = useState<UploadRecord[]>([]);
  const [studentTargets, setStudentTargets] = useState<UploadAssignableUser[]>([]);
  const [lecturerTargets, setLecturerTargets] = useState<UploadAssignableUser[]>([]);
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

  const targetOptions = uploadKind === "STUDENT_SUBMISSION" ? studentTargets : lecturerTargets;

  useEffect(() => {
    if (!isAdmin) return;
    setTargetUserId((current) => (targetOptions.some((option) => option.id === current) ? current : (targetOptions[0]?.id ?? "")));
  }, [isAdmin, targetOptions]);

  const subtitle = useMemo(() => {
    if (isAdmin) return "Upload lecturer materials or student submissions for a selected lecturer or student.";
    if (canDelete) return "Upload and share lecturer materials.";
    if (canUpload) return "Upload your submission and view shared lecturer materials.";
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
      setError(uploadKind === "STUDENT_SUBMISSION" ? "Select a student first." : "Select a lecturer first.");
      return;
    }

    setBusy(true);
    try {
      await uploadFile({ file, kind: uploadKind, targetUserId: isAdmin ? targetUserId : undefined });
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

      <div className={`mt-6 grid grid-cols-1 gap-6 ${canUpload ? "lg:grid-cols-[420px_1fr]" : ""}`}>
        {canUpload && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
            <div className="text-lg font-semibold text-white">Upload a file</div>
            <div className="mt-1 text-sm text-slate-400">
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
                <label className="block text-sm text-slate-300">Type</label>
                {isAdmin ? (
                  <select
                    value={uploadKind}
                    onChange={(e) => setUploadKind(e.target.value as UploadKind)}
                    disabled={busy}
                    className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-slate-300"
                  >
                    <option value="LECTURER_MATERIAL">Lecturer material</option>
                    <option value="STUDENT_SUBMISSION">Student submission</option>
                  </select>
                ) : (
                  <input
                    value={kindLabel(uploadKind)}
                    readOnly
                    className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-slate-300"
                  />
                )}
              </div>

              {isAdmin && (
                <div>
                  <label className="block text-sm text-slate-300">
                    {uploadKind === "STUDENT_SUBMISSION" ? "For student" : "For lecturer"}
                  </label>
                  <select
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    disabled={busy || targetOptions.length === 0}
                    className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-slate-300"
                  >
                    {targetOptions.length === 0 ? (
                      <option value="">
                        {uploadKind === "STUDENT_SUBMISSION" ? "No students available" : "No lecturers available"}
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
                <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-100">
                  {uploadKind === "STUDENT_SUBMISSION"
                    ? "Create or register a student account first."
                    : "Create or register a lecturer account first."}
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-300">File</label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border file:border-slate-700 file:bg-slate-900/60 file:px-4 file:py-2 file:text-slate-200 hover:file:bg-slate-900"
                  disabled={busy}
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || (isAdmin && targetOptions.length === 0)}
                className="w-full rounded-lg bg-blue-600 py-3 font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? "Uploading..." : "Upload"}
              </button>
            </form>
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Files</div>
              <div className="mt-1 text-sm text-slate-400">
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
              className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-900/50"
            >
              Refresh
            </button>
          </div>

          {!canUpload && error && (
            <div className="mt-4 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="text-slate-400">Loading...</div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-6 text-slate-300">
                No files yet.
              </div>
            ) : (
              items.map((u) => (
                <div key={u.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-white font-semibold">{u.fileName}</div>

                      <div className="mt-1 text-xs text-slate-400">
                        {kindLabel(u.kind)} - {prettySize(u.size)} - {new Date(u.uploadedAt).toLocaleString()}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        Uploaded by: {u.uploaderEmail}
                      </div>
                      {u.targetUserEmail && (
                        <div className="mt-1 text-xs text-slate-500">
                          For: {u.targetUserEmail}
                          {u.targetUserRole ? ` (${u.targetUserRole.toLowerCase()})` : ""}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void downloadUpload({ uploadId: u.id, fileName: u.fileName })}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Download
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void onDelete(u.id)}
                          disabled={deletingId === u.id}
                          className="rounded-lg border border-red-700/40 bg-red-950/30 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-950/50 disabled:opacity-60"
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

          <div className="mt-4 text-xs text-slate-500">
            Logged in as: {email} ({role})
          </div>
        </div>
      </div>
    </div>
  );
}
