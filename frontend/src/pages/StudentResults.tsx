import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { downloadStudentResults, getStudentResults, type Result } from "../api/parent";

function formatResultDate(value: string): string {
  if (!value) return "Unknown date";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function performanceTone(percent: number): string {
  if (percent >= 75) {
    return "border-[rgba(52,211,153,0.30)] bg-[rgba(52,211,153,0.14)] text-[#d9fff1]";
  }
  if (percent >= 50) {
    return "border-[rgba(255,196,87,0.30)] bg-[rgba(255,196,87,0.14)] text-[#ffecc2]";
  }
  return "border-[rgba(255,102,146,0.30)] bg-[rgba(255,102,146,0.14)] text-[#ffdbe6]";
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
              className="btn-secondary min-w-[120px]"
              title="Refresh results"
              aria-label="Refresh results"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={onDownload}
              disabled={loading || downloading}
              className="btn-primary min-w-[140px]"
              title="Download results CSV"
              aria-label="Download results CSV"
            >
              {downloading ? "Downloading..." : "Download CSV"}
            </button>
          </>
        }
      />

      {downloadError && <div className="error-banner">{downloadError}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass-panel p-5">
          <div className="text-sm text-white/55">Published results</div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {results.length}
          </div>
        </div>

        <div className="glass-panel p-5">
          <div className="text-sm text-white/55">Average</div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {averagePercent == null ? "N/A" : `${averagePercent}%`}
          </div>
        </div>

        <div className="glass-panel p-5">
          <div className="text-sm text-white/55">Latest update</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {sortedResults[0]?.date
              ? formatResultDate(sortedResults[0].date)
              : "No results yet"}
          </div>
        </div>
      </div>

      <section className="teal-glow-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-lg font-semibold text-white">
              Assessment results
            </div>
            <div className="mt-1 text-sm text-white/70">
              Academic staff publish results here. Result notifications now open this page directly.
            </div>
          </div>

          <div className="rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.56)] px-3 py-2 text-xs text-white/70">
            {sortedResults.length} record(s)
          </div>
        </div>

        <div className="divider-soft my-5" />

        {loading ? (
          <div className="info-banner">Loading results...</div>
        ) : error ? (
          <div className="error-banner">{error}</div>
        ) : sortedResults.length === 0 ? (
          <div className="info-banner">No results have been published yet.</div>
        ) : (
          <div className="space-y-3">
            {sortedResults.map((result) => {
              const outOf = result.outOf > 0 ? result.outOf : 100;
              const percent = Math.round((result.score / outOf) * 100);
              const performance =
                percent >= 75 ? "Excellent" : percent >= 50 ? "Pass" : "Needs attention";

              return (
                <div key={result.id} className="glass-panel p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold text-white">
                        {result.subject}
                      </div>
                      <div className="mt-1 text-xs text-white/55">
                        Published on {formatResultDate(result.date)}
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="font-semibold text-white">
                        {result.score}/{outOf} ({percent}%)
                      </div>
                      <div className="mt-2">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            performanceTone(percent),
                          ].join(" ")}
                        >
                          {performance}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
