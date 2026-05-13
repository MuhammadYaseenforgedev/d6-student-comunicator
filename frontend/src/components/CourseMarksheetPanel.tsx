import { useEffect, useMemo, useState } from "react";
import {
  getModuleMarksheet,
  saveBulkModuleMarksheet,
  saveSingleModuleMark,
  type ModuleMarksheetStudent,
} from "../api/parent";
import type { CourseModule } from "../lib/courseApi";

type CourseMarksheetPanelProps = {
  modules: CourseModule[];
  selectedModuleId?: string;
  onSelectedModuleIdChange?: (moduleId: string) => void;
};

function studentDisplayName(student: ModuleMarksheetStudent): string {
  return `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || student.email;
}

export default function CourseMarksheetPanel({
  modules,
  selectedModuleId,
  onSelectedModuleIdChange,
}: CourseMarksheetPanelProps) {
  const [internalModuleId, setInternalModuleId] = useState(selectedModuleId ?? "");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [outOf, setOutOf] = useState("100");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ModuleMarksheetStudent[]>([]);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const activeModuleId = selectedModuleId ?? internalModuleId;
  const activeModule = useMemo(
    () => modules.find((module) => module.id === activeModuleId) ?? null,
    [activeModuleId, modules]
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const haystack = [
        studentDisplayName(row),
        row.studentNumber ?? "",
        row.email,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, search]);

  useEffect(() => {
    if (selectedModuleId !== undefined) return;
    setInternalModuleId((current) =>
      modules.some((module) => module.id === current) ? current : (modules[0]?.id ?? "")
    );
  }, [modules, selectedModuleId]);

  function updateModule(moduleId: string) {
    if (selectedModuleId === undefined) setInternalModuleId(moduleId);
    onSelectedModuleIdChange?.(moduleId);
  }

  async function loadMarksheet() {
    if (!activeModuleId) {
      setError("Select a module first.");
      return;
    }
    if (!subject.trim()) {
      setError("Assessment title is required before loading the marksheet.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setInfo(null);
      const result = await getModuleMarksheet({
        moduleId: activeModuleId,
        subject: subject.trim(),
        date,
      });
      setRows(result.value);
      setScoreDrafts(
        Object.fromEntries(
          result.value.map((row) => [row.id, row.score == null ? "" : String(row.score)])
        )
      );
    } catch (e) {
      setRows([]);
      setScoreDrafts({});
      setError(e instanceof Error ? e.message : "Failed to load module marksheet");
    } finally {
      setLoading(false);
    }
  }

  async function saveAll() {
    if (!activeModuleId) {
      setError("Select a module first.");
      return;
    }
    if (!subject.trim()) {
      setError("Assessment title is required.");
      return;
    }
    const outOfValue = Number(outOf);
    if (!Number.isInteger(outOfValue) || outOfValue <= 0) {
      setError("Out Of must be a whole number greater than 0.");
      return;
    }

    const payloadRows = rows
      .map((row) => ({
        studentId: row.id,
        score: Number(scoreDrafts[row.id]),
      }))
      .filter((row) => Number.isInteger(row.score));

    if (payloadRows.length === 0) {
      setError("Enter at least one learner score before saving.");
      return;
    }
    if (payloadRows.some((row) => row.score < 0 || row.score > outOfValue)) {
      setError("Every score must be between 0 and Out Of.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await saveBulkModuleMarksheet({
        moduleId: activeModuleId,
        subject: subject.trim(),
        outOf: outOfValue,
        date,
        rows: payloadRows,
      });
      setInfo("Marksheet saved.");
      await loadMarksheet();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save marksheet");
    } finally {
      setBusy(false);
    }
  }

  async function saveOne(studentId: string) {
    if (!activeModuleId || !subject.trim()) {
      setError("Select a module and assessment title first.");
      return;
    }
    const score = Number(scoreDrafts[studentId]);
    const outOfValue = Number(outOf);
    if (!Number.isInteger(score)) {
      setError("Enter a whole-number score before saving.");
      return;
    }
    if (!Number.isInteger(outOfValue) || outOfValue <= 0) {
      setError("Out Of must be a whole number greater than 0.");
      return;
    }
    if (score < 0 || score > outOfValue) {
      setError("Score must be between 0 and Out Of.");
      return;
    }

    try {
      setSavingStudentId(studentId);
      setError(null);
      setInfo(null);
      await saveSingleModuleMark({
        moduleId: activeModuleId,
        studentId,
        subject: subject.trim(),
        score,
        outOf: outOfValue,
        date,
      });
      setInfo("Learner result saved.");
      await loadMarksheet();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save learner result");
    } finally {
      setSavingStudentId(null);
    }
  }

  return (
    <div className="teal-glow-card space-y-4 p-5">
      <div>
        <div className="text-lg font-semibold text-white">Marksheet</div>
        <div className="mt-1 text-sm text-white/72">
          Load a module marksheet for a specific assessment, update the class together, or save one learner at a time.
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {info && <div className="info-banner">{info}</div>}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        <select
          value={activeModuleId}
          onChange={(e) => updateModule(e.target.value)}
          className="select-glass"
          title="Select marksheet module"
          aria-label="Select marksheet module"
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
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Assessment title"
          className="input-glass"
          title="Assessment title"
          aria-label="Assessment title"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input-glass"
          title="Assessment date"
          aria-label="Assessment date"
        />
        <input
          value={outOf}
          onChange={(e) => setOutOf(e.target.value)}
          placeholder="Out Of"
          className="input-glass"
          title="Assessment total"
          aria-label="Assessment total"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void loadMarksheet()}
          disabled={loading || !activeModuleId}
          className="btn-secondary px-4 py-2 text-sm disabled:opacity-60"
        >
          {loading ? "Loading..." : "Load marksheet"}
        </button>
        <button
          type="button"
          onClick={() => void saveAll()}
          disabled={busy || loading || rows.length === 0}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          {busy ? "Saving..." : "Save all entered marks"}
        </button>
      </div>

      <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] p-3 text-sm text-white/75">
        {activeModule
          ? `Managing ${activeModule.code} - ${activeModule.name}.`
          : "Select a module to load the academic marksheet."}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search learners by name, number, or email"
        className="input-glass"
        aria-label="Search learners in marksheet"
        title="Search learners in marksheet"
      />

      <div className="space-y-3">
        {loading ? (
          <div className="info-banner">Loading marksheet...</div>
        ) : rows.length === 0 ? (
          <div className="info-banner">
            Enter an assessment title, pick a module, then load the marksheet to start marking learners.
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="info-banner">No learners matched your search.</div>
        ) : (
          visibleRows.map((row) => (
            <div
              key={row.id}
              className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-4"
            >
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_160px_auto] lg:items-center">
                <div>
                  <div className="font-semibold text-white">{studentDisplayName(row)}</div>
                  <div className="mt-1 text-xs text-white/60">
                    {row.studentNumber?.trim() || row.email}
                    {row.assessedAt ? ` | Existing mark on ${row.assessedAt}` : " | No mark saved yet"}
                  </div>
                </div>

                <input
                  value={scoreDrafts[row.id] ?? ""}
                  onChange={(e) =>
                    setScoreDrafts((current) => ({
                      ...current,
                      [row.id]: e.target.value,
                    }))
                  }
                  placeholder="Score"
                  className="input-glass"
                  title={`Score for ${studentDisplayName(row)}`}
                  aria-label={`Score for ${studentDisplayName(row)}`}
                />

                <button
                  type="button"
                  onClick={() => void saveOne(row.id)}
                  disabled={savingStudentId === row.id}
                  className="btn-secondary px-4 py-2 text-sm disabled:opacity-60"
                >
                  {savingStudentId === row.id ? "Saving..." : "Save learner"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
