// src/pages/parent/ParentResults.tsx
import { useEffect, useState } from "react";
import {
  downloadResults,
  getResults,
  listMyChildren,
  type ParentChild,
  type Result,
} from "../../api/parent";
import { toInlineError } from "./errorText";

function childIdentifier(child: ParentChild): string {
  const v = child.childUserId ?? child.studentUserId ?? child.userId ?? child.id;
  return typeof v === "string" ? v.trim() : "";
}

function childLabel(child: ParentChild): string {
  return child.publicStudentId
    ? `${child.publicStudentId} (${child.email})`
    : child.email;
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

  async function loadResultsForChild(targetChildId: string) {
    if (!targetChildId) {
      setResults([]);
      setResultsError(null);
      setLoadingResults(false);
      return;
    }

    setLoadingResults(true);
    setResultsError(null);
    try {
      const rows = await getResults(targetChildId);
      setResults(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setResultsError(toInlineError(e, "Failed to load results"));
      setResults([]);
    } finally {
      setLoadingResults(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadChildren() {
      setLoadingChildren(true);
      setChildrenError(null);
      try {
        const list = await listMyChildren();
        if (cancelled) return;

        setChildren(Array.isArray(list) ? list : []);
        const first =
          (Array.isArray(list) ? list : [])
            .map(childIdentifier)
            .find(Boolean) ?? "";
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
        a.download =
          fileName || `results-${new Date().toISOString().slice(0, 10)}.csv`;
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
      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">Child</div>
        <div className="mt-1 text-sm text-white/72">
          Select a linked child to view results.
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            id="parent-results-child"
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="input-glass w-full sm:max-w-md"
            disabled={loadingChildren || children.length === 0}
            aria-label="Select child for results"
            title="Select child for results"
          >
            {children.length === 0 ? (
              <option value="">
                {loadingChildren
                  ? "Loading linked children..."
                  : "No linked children found"}
              </option>
            ) : (
              children.map((c) => (
                <option key={c.id} value={childIdentifier(c)}>
                  {childLabel(c)}
                </option>
              ))
            )}
          </select>

          <button
            type="button"
            onClick={() => {
              void loadResultsForChild(selectedChildId);
            }}
            disabled={!selectedChildId || loadingResults}
            className="btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh
          </button>

          {childrenError && (
            <div className="error-banner p-2 text-sm">{childrenError}</div>
          )}
        </div>
      </div>

      <div className="teal-glow-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-white">
              Assessment Results
            </div>
            <div className="mt-1 text-sm text-white/72">
              Parents can view marks, but cannot edit anything.
            </div>
          </div>

          <button
            type="button"
            onClick={onDownloadResults}
            disabled={!selectedChildId || loadingResults || downloading}
            aria-label="Download results"
            title="Download results"
            className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
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
          <div className="error-banner mt-4 p-4 text-sm">{downloadError}</div>
        )}

        <div className="mt-1 text-sm text-white/72">
          Download results as a CSV for the selected child.
        </div>

        {!loadingChildren && !hasChildren && (
          <div className="mt-5 rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-4 text-sm text-white/80">
            No linked children found. Link a child first to view results.
          </div>
        )}

        {!selectedChildId && !loadingChildren && hasChildren && (
          <div className="mt-5 rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-4 text-sm text-white/80">
            Select a child to view this information.
          </div>
        )}

        {loadingResults && (
          <div className="mt-5 rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-4 text-sm text-white/80">
            Loading results...
          </div>
        )}

        {resultsError && (
          <div className="error-banner mt-5 p-4 text-sm">{resultsError}</div>
        )}

        {!loadingResults && !resultsError && selectedChildId && (
          <div className="mt-5 space-y-3">
            {results.length === 0 ? (
              <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-4 text-sm text-white/80">
                No results found.
              </div>
            ) : (
              results.map((r) => {
                const max = r.outOf > 0 ? r.outOf : 100;
                const pct = Math.round((r.score / max) * 100);
                return (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4 shadow-[0_0_18px_rgba(140,235,255,0.08)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.34)] hover:bg-[rgba(14,42,99,0.62)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-white">{r.subject}</div>
                        <div className="mt-1 text-xs text-white/55">
                          Date:{" "}
                          {r.date
                            ? new Date(r.date).toLocaleDateString()
                            : "Unknown"}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-semibold text-white">
                          {r.score}/{max} ({pct}%)
                        </div>
                        <div className="mt-1 text-xs text-white/55">
                          {pct >= 75
                            ? "Excellent"
                            : pct >= 50
                            ? "Pass"
                            : "At risk"}
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

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">Exam Dates</div>
        <div className="mt-2 text-sm text-white/72">
          Upcoming exam schedule will appear here when published.
        </div>
      </div>
    </div>
  );
}