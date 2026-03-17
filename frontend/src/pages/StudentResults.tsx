import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { downloadStudentResults, getStudentResults, type Result } from "../api/parent";

function formatResultDate(value: string): string {
  if (!value) return "Unknown date";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

export default function StudentResults() {
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const sortedResults = useMemo(
    () => [...results].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [results]
  );

  const averagePercent = useMemo(() => {
    if (results.length === 0) return null;

    const total = results.reduce((sum, row) => {
      const outOf = row.outOf > 0 ? row.outOf : 100;
      return sum + (row.score / outOf) * 100;
    }, 0);

    return Math.round(total / results.length);
  }, [results]);

  async function loadResults(showRefreshState = false) {
    if (showRefreshState) setRefreshing(true);
    else setLoading(true);

    setError(null);
    try {
      const rows = await getStudentResults();
      setResults(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your results");
      setResults([]);
    } finally {
      if (showRefreshState) setRefreshing(false);
      else setLoading(false);
    }
  }

  useEffect(() => {
    void loadResults();
  }, []);

  async function onDownload() {
    setDownloadError(null);
    setDownloading(true);
    try {
      const { blob, fileName } = await downloadStudentResults();
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
        title="Results"
        subtitle="View the marks that have been published for your account."
        actions={
          <>
            <button
              type="button"
              onClick={() => {
                void loadResults(true);
              }}
              disabled={loading || refreshing}
              className="rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-900/70 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={loading || downloading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? "Downloading..." : "Download CSV"}
            </button>
          </>
        }
      />

      {downloadError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
          {downloadError}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <div className="text-sm text-slate-400">Published results</div>
          <div className="mt-2 text-3xl font-semibold text-white">{results.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <div className="text-sm text-slate-400">Average</div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {averagePercent == null ? "N/A" : `${averagePercent}%`}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <div className="text-sm text-slate-400">Latest update</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {sortedResults[0]?.date ? formatResultDate(sortedResults[0].date) : "No results yet"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Assessment results</div>
        <div className="mt-1 text-sm text-slate-400">
          Your lecturers and admins publish results here. Result notifications now open this page directly.
        </div>

        {loading ? (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
            Loading results...
          </div>
        ) : error ? (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : sortedResults.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
            No results have been published yet.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {sortedResults.map((result) => {
              const outOf = result.outOf > 0 ? result.outOf : 100;
              const percent = Math.round((result.score / outOf) * 100);
              const performance =
                percent >= 75 ? "Excellent" : percent >= 50 ? "Pass" : "Needs attention";

              return (
                <div key={result.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-white">{result.subject}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        Published on {formatResultDate(result.date)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-semibold text-white">
                        {result.score}/{outOf} ({percent}%)
                      </div>
                      <div className="mt-1 text-xs text-slate-400">{performance}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
