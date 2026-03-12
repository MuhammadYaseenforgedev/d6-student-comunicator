// src/pages/ManageResults.tsx
// Results management page for staff users.
// Responsibilities:
// - Load results for a specific student
// - Create new results
// - Edit existing results
// - Delete results
// - Download results as a file
// - Use white cards with subtle purple border/shadow styling

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
    return [...results].sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    );
  }, [results]);

  const loadResults = useCallback(async (childId: string) => {
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
  }, []);

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
        a.download =
          fileName || `results-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setDownloadError(
        e instanceof Error ? e.message : "Failed to download results"
      );
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

      <div className="rounded-3xl border border-[#d9ccff] bg-white p-5 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
        <div className="text-lg font-semibold text-slate-900">Select Student</div>
        <div className="mt-1 text-sm text-slate-600">
          Enter student public ID (e.g. STU-1001) or student email.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            value={childIdInput}
            onChange={(e) => setChildIdInput(e.target.value)}
            placeholder="STU-1001 or student@email.com"
            className="rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
            aria-label="Student identifier"
            title="Student identifier"
          />

          <button
            type="button"
            onClick={onLoad}
            disabled={!canLoad || loading}
            className="btn-primary px-5 py-3 text-sm"
            title="Load student results"
            aria-label="Load student results"
          >
            {loading ? "Loading..." : "Load"}
          </button>

          <button
            type="button"
            onClick={onDownload}
            disabled={!hasActiveChild || loading || downloading}
            className="btn-secondary inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold disabled:opacity-60"
            title="Download results"
            aria-label="Download results"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 3v12" strokeLinecap="round" />
              <path
                d="m7 10 5 5 5-5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M4 21h16" strokeLinecap="round" />
            </svg>
            <span>{downloading ? "Downloading..." : "Download"}</span>
          </button>
        </div>

        {downloadError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {downloadError}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-[#d9ccff] bg-white p-5 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
        <div className="text-lg font-semibold text-slate-900">Create Result</div>

        <form
          onSubmit={onCreate}
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4"
        >
          <input
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            placeholder="Subject"
            className="rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
            aria-label="Result subject"
            title="Result subject"
          />

          <input
            value={newScore}
            onChange={(e) => setNewScore(e.target.value)}
            placeholder="Score"
            className="rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
            aria-label="Result score"
            title="Result score"
          />

          <input
            value={newOutOf}
            onChange={(e) => setNewOutOf(e.target.value)}
            placeholder="Out Of"
            className="rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
            aria-label="Result out of"
            title="Result out of"
          />

          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
            aria-label="Result date"
            title="Result date"
          />

          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={!hasActiveChild || busy}
              className="btn-primary px-5 py-2 text-sm"
              title="Add result"
              aria-label="Add result"
            >
              {busy ? "Saving..." : "Add Result"}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-[#d9ccff] bg-white p-5 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
        <div className="text-lg font-semibold text-slate-900">Results List</div>
        <div className="mt-2 text-sm text-slate-600">
          {hasActiveChild
            ? `Showing results for ${activeChildId}`
            : "Load a student to view results."}
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-4 text-sm text-slate-700">
              Loading results...
            </div>
          ) : sortedResults.length === 0 ? (
            <div className="rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-4 text-sm text-slate-700">
              No results found.
            </div>
          ) : (
            sortedResults.map((r) => {
              const isEditing = editing?.id === r.id;
              const max = r.outOf > 0 ? r.outOf : 100;
              const pct = Math.round((r.score / max) * 100);

              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-[#e2d8ff] bg-white p-4 text-slate-900 shadow-[0_8px_20px_rgba(121,77,250,0.06)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#cbb8ff]"
                >
                  {!isEditing ? (
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {r.subject}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {r.score}/{max} ({pct}%) - {r.date || "Unknown date"}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="btn-secondary px-3 py-1 text-xs"
                          title="Edit result"
                          aria-label="Edit result"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => onDelete(r.id)}
                          disabled={busy}
                          className="btn-danger px-3 py-1 text-xs disabled:opacity-60"
                          title="Delete result"
                          aria-label="Delete result"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <input
                        value={editing.subject}
                        onChange={(e) =>
                          setEditing({ ...editing, subject: e.target.value })
                        }
                        className="rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
                        aria-label="Edit subject"
                        title="Edit subject"
                      />

                      <input
                        value={editing.score}
                        onChange={(e) =>
                          setEditing({ ...editing, score: e.target.value })
                        }
                        className="rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
                        aria-label="Edit score"
                        title="Edit score"
                      />

                      <input
                        value={editing.outOf}
                        onChange={(e) =>
                          setEditing({ ...editing, outOf: e.target.value })
                        }
                        className="rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
                        aria-label="Edit out of"
                        title="Edit out of"
                      />

                      <input
                        type="date"
                        value={editing.date}
                        onChange={(e) =>
                          setEditing({ ...editing, date: e.target.value })
                        }
                        className="rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
                        aria-label="Edit result date"
                        title="Edit result date"
                      />

                      <div className="sm:col-span-4 flex gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={busy}
                          className="btn-primary px-4 py-2 text-xs"
                          title="Save changes"
                          aria-label="Save changes"
                        >
                          Save
                        </button>

                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="btn-secondary px-4 py-2 text-xs"
                          title="Cancel editing"
                          aria-label="Cancel editing"
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