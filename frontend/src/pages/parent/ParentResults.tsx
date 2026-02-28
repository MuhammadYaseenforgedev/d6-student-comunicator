// src/pages/parent/ParentResults.tsx
import { useEffect, useState } from "react";
import { downloadResults, getResults, listMyChildren, type ParentChild, type Result } from "../../api/parent";
import { toInlineError } from "./errorText";

function childIdentifier(child: ParentChild): string {
  return (child.publicStudentId ?? child.email).trim();
}

function childLabel(child: ParentChild): string {
  return child.publicStudentId ? `${child.publicStudentId} (${child.email})` : child.email;
}

export default function ParentResults() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const hasChildren = children.length > 0;

  useEffect(() => {
    let cancelled = false;

    async function loadChildren() {
      setLoadingChildren(true);
      setChildrenError(null);
      try {
        const list = await listMyChildren();
        if (cancelled) return;

        setChildren(Array.isArray(list) ? list : []);
        const first = (Array.isArray(list) ? list : []).map(childIdentifier).find(Boolean) ?? "";
        setSelectedChildId(first);
      } catch (e) {
        if (!cancelled) {
          setChildrenError(toInlineError(e, "Failed to load children"));
          setChildren([]);
          setSelectedChildId("");
        }
      } finally {
        if (!cancelled) setLoadingChildren(false);
      }
    }

    void loadChildren();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedChildId) {
      setResults([]);
      setResultsError(null);
      setLoadingResults(false);
      return;
    }

    let cancelled = false;

    async function loadResults() {
      setLoadingResults(true);
      setResultsError(null);
      try {
        const rows = await getResults(selectedChildId);
        if (cancelled) return;
        setResults(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (!cancelled) {
          setResultsError(toInlineError(e, "Failed to load results"));
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoadingResults(false);
      }
    }

    void loadResults();
    return () => {
      cancelled = true;
    };
  }, [selectedChildId]);

  async function onDownloadResults() {
    if (!selectedChildId) return;

    setDownloadError(null);
    setDownloading(true);
    try {
      const { blob, fileName } = await downloadResults(selectedChildId);
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
      setDownloadError(toInlineError(e, "Failed to download results"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Child</div>
        <div className="mt-1 text-sm text-slate-400">Select a linked child to view results.</div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50 sm:max-w-md"
            disabled={loadingChildren || children.length === 0}
          >
            {children.length === 0 ? (
              <option value="">
                {loadingChildren ? "Loading linked children..." : "No linked children found"}
              </option>
            ) : (
              children.map((c) => (
                <option key={c.id} value={childIdentifier(c)}>
                  {childLabel(c)}
                </option>
              ))
            )}
          </select>

          {childrenError && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-2 text-sm text-red-200">
              {childrenError}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-white">Assessment Results</div>
            <div className="mt-1 text-sm text-slate-400">
              Parents can view marks, but cannot edit anything.
            </div>
          </div>

          <button
            type="button"
            onClick={onDownloadResults}
            disabled={!selectedChildId || loadingResults || downloading}
            aria-label="Download results"
            title="Download results"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-60"
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
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
            {downloadError}
          </div>
        )}

        <div className="mt-1 text-sm text-slate-400">
          Download results as a CSV for the selected child.
        </div>

        {!loadingChildren && !hasChildren && (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
            No linked children found. Link a child first to view results.
          </div>
        )}

        {!selectedChildId && !loadingChildren && hasChildren && (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
            Select a child to load results.
          </div>
        )}

        {loadingResults && (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
            Loading results...
          </div>
        )}

        {resultsError && (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
            {resultsError}
          </div>
        )}

        {!loadingResults && !resultsError && selectedChildId && (
          <div className="mt-5 space-y-3">
            {results.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
                No results found.
              </div>
            ) : (
              results.map((r) => {
                const max = r.outOf > 0 ? r.outOf : 100;
                const pct = Math.round((r.score / max) * 100);
                return (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-white">{r.subject}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          Date: {r.date ? new Date(r.date).toLocaleDateString() : "Unknown"}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-semibold text-white">
                          {r.score}/{max} ({pct}%)
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {pct >= 75 ? "Excellent" : pct >= 50 ? "Pass" : "At risk"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Exam Dates</div>
        <div className="mt-2 text-sm text-slate-400">
          Upcoming exam schedule will appear here when published.
        </div>
      </div>
    </div>
  );
}
