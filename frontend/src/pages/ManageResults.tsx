import { useCallback, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import {
  createResultForStaff,
  deleteResultForStaff,
  downloadResultsForStaff,
  listResultsForStaff,
  updateResultForStaff,
  type Result,
} from "../api/parent";

type EditorState = {
  id: string;
  subject: string;
  score: string;
  outOf: string;
  date: string;
};

function toLocalDate(raw: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function toFormEditor(r: Result): EditorState {
  return {
    id: r.id,
    subject: r.subject,
    score: String(r.score),
    outOf: String(r.outOf),
    date: toLocalDate(r.date),
  };
}

export default function ManageResults() {
  const [childIdInput, setChildIdInput] = useState("");
  const [activeChildId, setActiveChildId] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [newSubject, setNewSubject] = useState("");
  const [newScore, setNewScore] = useState("");
  const [newOutOf, setNewOutOf] = useState("100");
  const [newDate, setNewDate] = useState("");

  const [editing, setEditing] = useState<EditorState | null>(null);

  const canLoad = childIdInput.trim().length > 0;
  const hasActiveChild = activeChildId.trim().length > 0;

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [results]);

  const loadResults = useCallback(
    async (childId: string) => {
      const cleaned = childId.trim();
      if (!cleaned) return;

      setLoading(true);
      setError(null);
      try {
        const rows = await listResultsForStaff(cleaned);
        setResults(Array.isArray(rows) ? rows : []);
        setActiveChildId(cleaned);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load results");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  async function onLoad() {
    await loadResults(childIdInput);
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hasActiveChild) {
      setError("Load a student first.");
      return;
    }

    const subject = newSubject.trim();
    const score = Number(newScore);
    const outOf = Number(newOutOf);

    if (!subject) {
      setError("Subject is required.");
      return;
    }
    if (!Number.isInteger(score)) {
      setError("Score must be an integer.");
      return;
    }
    if (!Number.isInteger(outOf) || outOf <= 0) {
      setError("Out Of must be an integer greater than 0.");
      return;
    }
    if (score < 0 || score > outOf) {
      setError("Score must be between 0 and Out Of.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await createResultForStaff({
        childId: activeChildId,
        subject,
        score,
        outOf,
        date: newDate.trim() || undefined,
      });

      setNewSubject("");
      setNewScore("");
      setNewOutOf("100");
      setNewDate("");

      await loadResults(activeChildId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create result");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(r: Result) {
    setEditing(toFormEditor(r));
    setError(null);
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit() {
    if (!editing) return;

    const subject = editing.subject.trim();
    const score = Number(editing.score);
    const outOf = Number(editing.outOf);

    if (!subject) {
      setError("Subject is required.");
      return;
    }
    if (!Number.isInteger(score)) {
      setError("Score must be an integer.");
      return;
    }
    if (!Number.isInteger(outOf) || outOf <= 0) {
      setError("Out Of must be an integer greater than 0.");
      return;
    }
    if (score < 0 || score > outOf) {
      setError("Score must be between 0 and Out Of.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await updateResultForStaff(editing.id, {
        subject,
        score,
        outOf,
        date: editing.date.trim() || undefined,
      });
      setEditing(null);
      await loadResults(activeChildId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update result");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    const ok = window.confirm("Delete this result?");
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      await deleteResultForStaff(id);
      await loadResults(activeChildId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete result");
    } finally {
      setBusy(false);
    }
  }

  async function onDownload() {
    if (!hasActiveChild) return;

    setDownloadError(null);
    setDownloading(true);
    try {
      const { blob, fileName } = await downloadResultsForStaff(activeChildId);
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName || `results-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Failed to download results");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Results"
        subtitle="Admin and Lecturer can create, edit, delete, and download student results."
      />

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Select Student</div>
        <div className="mt-1 text-sm text-slate-400">
          Enter student public ID (e.g. STU-1001) or student email.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            value={childIdInput}
            onChange={(e) => setChildIdInput(e.target.value)}
            placeholder="STU-1001 or student@email.com"
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-600"
          />

          <button
            type="button"
            onClick={onLoad}
            disabled={!canLoad || loading}
            className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Load"}
          </button>

          <button
            type="button"
            onClick={onDownload}
            disabled={!hasActiveChild || loading || downloading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-900/70 disabled:opacity-60"
            title="Download results"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v12" strokeLinecap="round" />
              <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 21h16" strokeLinecap="round" />
            </svg>
            <span>{downloading ? "Downloading..." : "Download"}</span>
          </button>
        </div>

        {downloadError && (
          <div className="mt-4 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
            {downloadError}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Create Result</div>
        <form onSubmit={onCreate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            placeholder="Subject"
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
          />
          <input
            value={newScore}
            onChange={(e) => setNewScore(e.target.value)}
            placeholder="Score"
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
          />
          <input
            value={newOutOf}
            onChange={(e) => setNewOutOf(e.target.value)}
            placeholder="Out Of"
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
          />
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
          />

          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={!hasActiveChild || busy}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? "Saving..." : "Add Result"}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Results List</div>
        <div className="mt-2 text-sm text-slate-400">
          {hasActiveChild ? `Showing results for ${activeChildId}` : "Load a student to view results."}
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
              Loading results...
            </div>
          ) : sortedResults.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
              No results found.
            </div>
          ) : (
            sortedResults.map((r) => {
              const isEditing = editing?.id === r.id;
              const max = r.outOf > 0 ? r.outOf : 100;
              const pct = Math.round((r.score / max) * 100);

              return (
                <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  {!isEditing ? (
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-white">{r.subject}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {r.score}/{max} ({pct}%) - {r.date || "Unknown date"}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-1 text-xs hover:bg-slate-900/70"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(r.id)}
                          disabled={busy}
                          className="rounded-lg border border-red-700/40 bg-red-950/30 px-3 py-1 text-xs text-red-200 hover:bg-red-950/50 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <input
                        value={editing.subject}
                        onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                        className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
                      />
                      <input
                        value={editing.score}
                        onChange={(e) => setEditing({ ...editing, score: e.target.value })}
                        className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
                      />
                      <input
                        value={editing.outOf}
                        onChange={(e) => setEditing({ ...editing, outOf: e.target.value })}
                        className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
                      />
                      <input
                        type="date"
                        value={editing.date}
                        onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                        className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
                      />

                      <div className="sm:col-span-4 flex gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={busy}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold hover:bg-blue-700 disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-2 text-xs hover:bg-slate-900/70"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
