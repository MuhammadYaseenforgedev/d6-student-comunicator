import { useEffect, useMemo, useState } from "react";
import {
  deleteUpload,
  downloadUpload,
  listUploads,
  uploadFile,
} from "../api/uploads";
import type { CourseModule } from "../lib/courseApi";
import type { UploadRecord } from "../lib/types";

type CourseAssessmentsPanelProps = {
  modules: CourseModule[];
  selectedModuleId?: string;
  onSelectedModuleIdChange?: (moduleId: string) => void;
  canManage: boolean;
  title?: string;
  subtitle?: string;
};

function prettySize(bytes: number) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function CourseAssessmentsPanel({
  modules,
  selectedModuleId,
  onSelectedModuleIdChange,
  canManage,
  title = "Assessments",
  subtitle = "Lecturers can upload assessments for a module, and enrolled students can download the files relevant to their modules.",
}: CourseAssessmentsPanelProps) {
  const [internalModuleId, setInternalModuleId] = useState(selectedModuleId ?? "");
  const [items, setItems] = useState<UploadRecord[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const activeModuleId = selectedModuleId ?? internalModuleId;
  const activeModule = useMemo(
    () => modules.find((module) => module.id === activeModuleId) ?? null,
    [activeModuleId, modules]
  );

  useEffect(() => {
    if (selectedModuleId !== undefined) return;
    setInternalModuleId((current) =>
      modules.some((module) => module.id === current) ? current : (modules[0]?.id ?? "")
    );
  }, [modules, selectedModuleId]);

  useEffect(() => {
    if (!activeModuleId) {
      setItems([]);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const rows = await listUploads({ kind: "LECTURER_MATERIAL", moduleId: activeModuleId });
        if (!cancelled) {
          setItems(rows);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setItems([]);
          setError(e instanceof Error ? e.message : "Failed to load assessments");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeModuleId]);

  function updateModule(moduleId: string) {
    if (selectedModuleId === undefined) setInternalModuleId(moduleId);
    onSelectedModuleIdChange?.(moduleId);
  }

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeModuleId) {
      setError("Select a module before uploading an assessment.");
      return;
    }
    if (!file) {
      setError("Choose a file to upload first.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await uploadFile({
        file,
        kind: "LECTURER_MATERIAL",
        moduleId: activeModuleId,
      });
      setFile(null);
      setItems(await listUploads({ kind: "LECTURER_MATERIAL", moduleId: activeModuleId }));
      setInfo("Assessment uploaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload assessment");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(uploadId: string) {
    const confirmed = window.confirm("Delete this assessment file?");
    if (!confirmed) return;
    try {
      setDeletingId(uploadId);
      setError(null);
      setInfo(null);
      await deleteUpload({ uploadId });
      setItems((current) => current.filter((item) => item.id !== uploadId));
      setInfo("Assessment deleted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete assessment");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="teal-glow-card space-y-4 p-5">
      <div>
        <div className="text-lg font-semibold text-white">{title}</div>
        <div className="mt-1 text-sm text-white/72">{subtitle}</div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {info && <div className="info-banner">{info}</div>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
        <select
          value={activeModuleId}
          onChange={(e) => updateModule(e.target.value)}
          disabled={modules.length === 0}
          className="select-glass"
          title="Select assessment module"
          aria-label="Select assessment module"
        >
          {modules.length === 0 ? (
            <option value="">No modules available</option>
          ) : (
            modules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.code} - {module.name}
              </option>
            ))
          )}
        </select>

        <div className="rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.56)] px-3 py-2 text-xs text-white/72">
          {items.length} file(s)
        </div>
      </div>

      {canManage && (
        <form onSubmit={onUpload} className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-white file:mr-4 file:rounded-xl file:border file:file:border-[rgba(140,235,255,0.18)] file:file:bg-[rgba(8,18,48,0.86)] file:file:px-4 file:file:py-2 file:file:text-white"
            disabled={busy}
            aria-label="Choose assessment file"
            title="Choose assessment file"
          />
          <button
            type="submit"
            disabled={busy || !activeModuleId}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            {busy ? "Uploading..." : "Upload assessment"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="info-banner">Loading assessments...</div>
        ) : !activeModule ? (
          <div className="info-banner">Select a module to view assessments.</div>
        ) : items.length === 0 ? (
          <div className="info-banner">
            {canManage
              ? "No assessments uploaded for this module yet."
              : "No assessments are available for this module yet."}
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="font-semibold text-white">{item.fileName}</div>
                  <div className="mt-1 text-xs text-white/65">
                    {item.moduleCode ?? activeModule.code} - {item.moduleName ?? activeModule.name}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    Uploaded by {item.uploaderEmail} on {new Date(item.uploadedAt).toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {prettySize(item.size)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void downloadUpload({ uploadId: item.id, fileName: item.fileName })}
                    className="btn-primary px-3 py-2 text-xs"
                  >
                    Download
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => void onDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="btn-danger px-3 py-2 text-xs disabled:opacity-60"
                    >
                      {deletingId === item.id ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
