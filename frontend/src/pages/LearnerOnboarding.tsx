import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import {
  listLearnerOnboardingRecords,
  sendLearnerActivation,
  type LearnerOnboardingRecord,
  type LearnerOnboardingStatusFilter,
} from "../lib/learnerOnboardingApi";

const STATUS_FILTERS: LearnerOnboardingStatusFilter[] = [
  "ALL",
  "PENDING_ACTIVATION",
  "INVITED",
  "ACTIVATED",
];

const SOURCE_FILTERS = ["ALL", "TALENT", "CSV", "MANUAL"] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number];

function statusLabel(status: string | null | undefined): string {
  if (!status) return "Imported";
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusTone(status: string | null | undefined): string {
  const normalized = String(status ?? "IMPORTED").toUpperCase();
  if (normalized === "ACTIVATED") return "border-emerald-400/25 bg-emerald-500/12 text-emerald-200";
  if (normalized === "INVITED") return "border-sky-400/25 bg-sky-500/12 text-sky-200";
  if (normalized === "PENDING_ACTIVATION") return "border-amber-400/25 bg-amber-500/12 text-amber-200";
  if (normalized === "FAILED") return "border-rose-400/25 bg-rose-500/12 text-rose-200";
  if (normalized === "DUPLICATE") return "border-orange-400/25 bg-orange-500/12 text-orange-200";
  return "border-[rgba(140,235,255,0.20)] bg-[rgba(140,235,255,0.10)] text-[#d9fbff]";
}

function formatDate(raw: string | null | undefined): string {
  if (!raw) return "Not available";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  return new Date(ms).toLocaleString();
}

function learnerName(row: LearnerOnboardingRecord): string {
  return row.learnerName?.trim() || [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.email;
}

function sourceLabel(row: LearnerOnboardingRecord): string {
  const source = row.externalSource?.trim() || "Imported";
  const sourceId = row.externalSourceId?.trim();
  return sourceId ? `${source} / ${sourceId}` : source;
}

function sourceFilterLabel(source: SourceFilter): string {
  if (source === "ALL") return "All sources";
  if (source === "TALENT") return "Talent";
  if (source === "CSV") return "CSV";
  return "Manual";
}

function activationLabel(row: LearnerOnboardingRecord): string {
  if (row.activatedAt || String(row.onboardingStatus ?? "").toUpperCase() === "ACTIVATED") {
    return "Activated";
  }
  if (row.hasActiveActivationToken) return "Invite active";
  if (row.activationRequired) return "Invite needed";
  return "Not required";
}

function activationTone(row: LearnerOnboardingRecord): string {
  const label = activationLabel(row);
  if (label === "Activated") return "border-emerald-400/25 bg-emerald-500/12 text-emerald-200";
  if (label === "Invite active") return "border-sky-400/25 bg-sky-500/12 text-sky-200";
  if (label === "Invite needed") return "border-amber-400/25 bg-amber-500/12 text-amber-200";
  return "border-white/15 bg-white/8 text-white/70";
}

function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span className={["rounded-full border px-2.5 py-1 text-[11px] font-semibold", className].join(" ")}>
      {children}
    </span>
  );
}

function SummaryCard({ label, value, tone = "text-white" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="glass-panel p-4">
      <div className="text-xs uppercase tracking-wide text-white/55">{label}</div>
      <div className={["mt-2 text-2xl font-bold", tone].join(" ")}>{value}</div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="glass-panel animate-pulse p-4">
          <div className="h-4 w-44 rounded-full bg-white/12" />
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="h-3 rounded-full bg-white/10" />
            <div className="h-3 rounded-full bg-white/10" />
            <div className="h-3 rounded-full bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LearnerOnboarding() {
  const [records, setRecords] = useState<LearnerOnboardingRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<LearnerOnboardingStatusFilter>("ALL");
  const [activationFilter, setActivationFilter] = useState<"ALL" | "REQUIRED" | "NOT_REQUIRED">("ALL");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const activationRequired =
        activationFilter === "REQUIRED"
          ? true
          : activationFilter === "NOT_REQUIRED"
            ? false
            : null;
      const data = await listLearnerOnboardingRecords({
        q: search || undefined,
        onboardingStatus: statusFilter,
        activationRequired,
        source: sourceFilter === "ALL" ? undefined : sourceFilter,
        limit: 250,
      });
      setRecords(Array.isArray(data.value) ? data.value : []);
    } catch (e) {
      setRecords([]);
      setError(e instanceof Error ? e.message : "Failed to load learner onboarding records");
    } finally {
      setLoading(false);
    }
  }, [activationFilter, search, sourceFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    return records.reduce(
      (acc, row) => {
        acc.total += 1;
        const status = String(row.onboardingStatus ?? "IMPORTED").toUpperCase();
        if (status === "PENDING_ACTIVATION") acc.pending += 1;
        else if (status === "INVITED") acc.invited += 1;
        else if (status === "ACTIVATED") acc.activated += 1;
        else acc.imported += 1;
        return acc;
      },
      { total: 0, pending: 0, invited: 0, activated: 0, imported: 0 }
    );
  }, [records]);

  const hasActiveFilters =
    Boolean(search) ||
    statusFilter !== "ALL" ||
    activationFilter !== "ALL" ||
    sourceFilter !== "ALL";

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setStatusFilter("ALL");
    setActivationFilter("ALL");
    setSourceFilter("ALL");
  }

  async function onSendActivation(row: LearnerOnboardingRecord) {
    setBusyId(row.userId);
    setError(null);
    setNotice(null);

    try {
      const result = await sendLearnerActivation(row.userId);
      const operational = result.activation?.operationalStatus;
      setNotice(
        operational
          ? `${learnerName(row)} activation status: ${statusLabel(operational)}.`
          : `Activation invitation issued for ${learnerName(row)}.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to issue activation invitation");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learner Onboarding"
        subtitle="Track imported learners, activation invitations, and onboarding completion."
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="btn-secondary min-w-[120px]"
            title="Refresh learner onboarding"
            aria-label="Refresh learner onboarding"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <SummaryCard label="Total" value={summary.total} />
        <SummaryCard label="Pending" value={summary.pending} tone="text-amber-200" />
        <SummaryCard label="Invited" value={summary.invited} tone="text-sky-200" />
        <SummaryCard label="Activated" value={summary.activated} tone="text-emerald-200" />
        <SummaryCard label="Other" value={summary.imported} tone="text-[#d9fbff]" />
      </div>

      <section className="teal-glow-card p-5">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_auto_auto_auto]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]"
          >
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, email, student number, or source ID"
              className="input-glass"
              title="Search learners"
              aria-label="Search learners"
            />
            <button type="submit" disabled={loading} className="btn-primary min-w-[110px]">
              Search
            </button>
          </form>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LearnerOnboardingStatusFilter)}
            className="select-glass"
            title="Filter onboarding status"
            aria-label="Filter onboarding status"
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            className="select-glass"
            title="Filter source"
            aria-label="Filter source"
          >
            {SOURCE_FILTERS.map((source) => (
              <option key={source} value={source}>
                {sourceFilterLabel(source)}
              </option>
            ))}
          </select>

          <select
            value={activationFilter}
            onChange={(e) => setActivationFilter(e.target.value as "ALL" | "REQUIRED" | "NOT_REQUIRED")}
            className="select-glass"
            title="Filter activation requirement"
            aria-label="Filter activation requirement"
          >
            <option value="ALL">All activation states</option>
            <option value="REQUIRED">Activation required</option>
            <option value="NOT_REQUIRED">Activation not required</option>
          </select>
        </div>

        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/62">
            <div>
              Showing filtered onboarding records
              {search ? ` for "${search}"` : ""}.
            </div>
            <button
              type="button"
              onClick={clearFilters}
              className="btn-secondary px-3 py-1 text-xs"
            >
              Clear filters
            </button>
          </div>
        )}

        {error && <div className="error-banner mt-4">{error}</div>}
        {notice && <div className="info-banner mt-4">{notice}</div>}

        <div className="divider-soft my-5" />

        <div className="app-page-scroll space-y-3 max-h-none overflow-visible pr-0 lg:max-h-[32rem] lg:overflow-y-auto lg:pr-1">
          {loading ? (
            <LoadingRows />
          ) : records.length === 0 ? (
            <div className="info-banner flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {hasActiveFilters
                  ? "No learner onboarding records matched the current filters."
                  : "No learner onboarding records are available yet."}
              </span>
              {hasActiveFilters && (
                <button type="button" onClick={clearFilters} className="btn-secondary px-3 py-1 text-xs">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            records.map((row) => {
              const status = row.onboardingStatus ?? "IMPORTED";
              const canInvite = row.canReissueActivation && String(status).toUpperCase() !== "ACTIVATED";

              return (
                <article key={row.userId} className="glass-panel p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-white">
                          {learnerName(row)}
                        </h2>
                        <span className={["rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusTone(status)].join(" ")}>
                          {statusLabel(status)}
                        </span>
                        <Badge className={activationTone(row)}>{activationLabel(row)}</Badge>
                        <Badge className="border-[rgba(140,235,255,0.20)] bg-[rgba(140,235,255,0.10)] text-[#d9fbff]">
                          {row.externalSource?.trim() || "Imported"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-sm text-white/74 md:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <span className="text-white/48">Email:</span>{" "}
                          <span className="font-medium text-white">{row.email}</span>
                        </div>
                        <div>
                          <span className="text-white/48">Course:</span>{" "}
                          <span className="font-medium text-white">
                            {row.courseName || row.courseCode || "Not assigned"}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/48">Student no:</span>{" "}
                          <span className="font-medium text-white">
                            {row.studentNumber || "Not assigned"}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/48">Source:</span>{" "}
                          <span className="font-medium text-white">{sourceLabel(row)}</span>
                        </div>
                        <div>
                          <span className="text-white/48">Activation:</span>{" "}
                          <span className="font-medium text-white">{activationLabel(row)}</span>
                        </div>
                        <div>
                          <span className="text-white/48">Created/imported:</span>{" "}
                          <span className="font-medium text-white">{formatDate(row.createdAt)}</span>
                        </div>
                        <div>
                          <span className="text-white/48">Invited:</span>{" "}
                          <span className="font-medium text-white">{formatDate(row.activationInvitedAt)}</span>
                        </div>
                      </div>

                      {row.activatedAt && (
                        <div className="text-xs text-emerald-200">
                          Activated {formatDate(row.activatedAt)}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void onSendActivation(row)}
                        disabled={!canInvite || busyId === row.userId}
                        className="btn-secondary"
                        title="Issue or reissue activation invite"
                        aria-label="Issue or reissue activation invite"
                      >
                        {busyId === row.userId
                          ? "Sending..."
                          : row.hasActiveActivationToken
                            ? "Reissue invite"
                            : "Send invite"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
