// src/pages/Uploads1.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import { addUpload, deleteUpload, listUploadsForRole } from "../lib/uploadStore";
import type { UploadKind, UploadRecord } from "../lib/types";

function prettySize(bytes: number) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function Uploads1() {
  const user = getUser();
  const role = user?.role ?? "STUDENT";
  const email = (user?.email ?? "dev@local").trim().toLowerCase();

  const [items, setItems] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<UploadKind>(
    role === "LECTURER" || role === "ADMIN" ? "LECTURER_MATERIAL" : "STUDENT_SUBMISSION"
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUploadLecturerMaterial = role === "LECTURER" || role === "ADMIN";
  const canDelete = role === "LECTURER" || role === "ADMIN";

  // Keep "Type" sensible when role changes (login as different role)
  useEffect(() => {
    setKind(role === "LECTURER" || role === "ADMIN" ? "LECTURER_MATERIAL" : "STUDENT_SUBMISSION");
  }, [role]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(listUploadsForRole(role, email));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load uploads");
    } finally {
      setLoading(false);
    }
  }, [role, email]);

  useEffect(() => {
    load();
  }, [load]);

  const subtitle = useMemo(() => {
    if (role === "LECTURER" || role === "ADMIN")
      return "Upload materials, and view student submissions.";
    if (role === "PARENT") return "View lecturer materials shared with learners.";
    return "View lecturer materials, and submit your work.";
  }, [role]);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Please choose a file first.");
      return;
    }

    if (kind === "LECTURER_MATERIAL" && !canUploadLecturerMaterial) {
      setError("Only lecturers (or admin) can upload lecturer materials.");
      return;
    }

    setBusy(true);
    try {
      await addUpload({ file, kind, uploaderEmail: email, uploaderRole: role });
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Uploads" subtitle={subtitle} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
        {/* Upload panel */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <div className="text-lg font-semibold text-white">Upload a file</div>
          <div className="mt-1 text-sm text-slate-400">
            Stored locally for now. Backend will move this into PostgreSQL.
          </div>

          <form onSubmit={onUpload} className="mt-4 space-y-3">
            <div>
              <label className="block text-sm text-slate-300">Type</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as UploadKind)}
                className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
              >
                {canUploadLecturerMaterial && (
                  <option value="LECTURER_MATERIAL">Lecturer material</option>
                )}
                {role !== "PARENT" && (
                  <option value="STUDENT_SUBMISSION">Student submission</option>
                )}
              </select>

              {kind === "STUDENT_SUBMISSION" && role === "STUDENT" && (
                <p className="mt-2 text-xs text-slate-500">
                  Only lecturers/admin can see student submissions. You can still see your own submissions.
                </p>
              )}

              {kind === "LECTURER_MATERIAL" && (
                <p className="mt-2 text-xs text-slate-500">
                  Lecturer materials are visible to students, parents, lecturers, and admin.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm text-slate-300">File</label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-2 block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border file:border-slate-700 file:bg-slate-900/60 file:px-4 file:py-2 file:text-slate-200 hover:file:bg-slate-900"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || role === "PARENT"}
              className="w-full rounded-lg bg-blue-600 py-3 font-semibold hover:bg-blue-700 disabled:opacity-60"
            >
              {role === "PARENT" ? "Parents cannot upload" : busy ? "Uploading..." : "Upload"}
            </button>
          </form>
        </div>

        {/* List panel */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Files</div>
              <div className="mt-1 text-sm text-slate-400">
                {role === "LECTURER" || role === "ADMIN"
                  ? "You can see all uploads."
                  : role === "PARENT"
                  ? "You can see lecturer materials only."
                  : "You can see lecturer materials + your own submissions."}
              </div>
            </div>

            <button
              type="button"
              onClick={load}
              className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-900/50"
            >
              Refresh
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="text-slate-400">Loading…</div>
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
                        {u.kind === "LECTURER_MATERIAL" ? "Lecturer material" : "Student submission"} •{" "}
                        {prettySize(u.size)} • {new Date(u.uploadedAt).toLocaleString()}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        Uploaded by: {u.uploaderEmail}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <a
                        href={u.dataUrl}
                        download={u.fileName}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Download
                      </a>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            deleteUpload({
                              id: u.id,
                              requesterRole: role,
                              requesterEmail: email,
                              });
                            load();
                          }}
                          className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs hover:bg-slate-900/50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
