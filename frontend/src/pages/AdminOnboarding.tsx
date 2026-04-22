import { useEffect, useMemo, useState } from "react";
import LearnerCsvImportPanel from "../components/LearnerCsvImportPanel";
import PageHeader from "../components/PageHeader";
import {
  listImportedLearners,
  sendLearnerActivation,
  type ImportedLearner,
} from "../lib/learnerImportApi";

type StatusFilter = "ALL" | "PENDING_ACTIVATION" | "INVITED" | "ACTIVATED";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING_ACTIVATION", label: "Pending activation" },
  { value: "INVITED", label: "Invited" },
  { value: "ACTIVATED", label: "Activated" },
];

function formatDate(raw: string | null | undefined): string {
  if (!raw) return "Not recorded";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  return new Date(ms).toLocaleString();
}

function statusLabel(status: string): string {
  if (status === "PENDING_ACTIVATION") return "Pending Activation";
  if (status === "INVITED") return "Invited";
  if (status === "ACTIVATED") return "Activated";
  return status.replace(/_/g, " ").toLowerCase();
}

function statusTone(status: string): string {
  if (status === "ACTIVATED") {
    return "border-[rgba(52,211,153,0.30)] bg-[rgba(52,211,153,0.14)] text-[#d9fff1]";
  }
  if (status === "PENDING_ACTIVATION") {
    return "border-[rgba(255,196,87,0.30)] bg-[rgba(255,196,87,0.14)] text-[#ffecc2]";
  }
  if (status === "INVITED") {
    return "border-[rgba(140,235,255,0.28)] bg-[rgba(140,235,255,0.12)] text-[#dffbff]";
  }
  return "border-white/10 bg-white/5 text-white/72";
}

function courseLabel(learner: ImportedLearner): string {
  const code = learner.courseCode?.trim();
  const name = learner.courseName?.trim();
  if (code && name) return `${code} - ${name}`;
  if (name) return name;
  if (code) return code;
  return "Not linked";
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-panel p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-white/55">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function LoadingRows() {
  return (
    <>
      {[0, 1, 2, 3].map((row) => (
        <tr key={row} className="border-t border-[rgba(140,235,255,0.10)]">
          <td colSpan={7} className="px-4 py-3">
            <div className="h-12 animate-pulse rounded-2xl bg-white/8" />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function AdminOnboarding() {
  const [learners, setLearners] = useState<ImportedLearner[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const summary = useMemo(() => {
    return learners.reduce(
      (acc, learner) => {
        acc.total += 1;
        if (learner.onboardingStatus === "PENDING_ACTIVATION") acc.pending += 1;
        if (learner.onboardingStatus === "INVITED") acc.invited += 1;
        if (learner.onboardingStatus === "ACTIVATED") acc.activated += 1;
        return acc;
      },
      { total: 0, pending: 0, invited: 0, activated: 0 }
    );
  }, [learners]);

  async function loadLearners() {
    try {
      setLoading(true);
      setError(null);
      const response = await listImportedLearners({
        q: search || undefined,
        onboardingStatus: statusFilter,
        limit: 250,
      });
      setLearners(Array.isArray(response.value) ? response.value : []);
    } catch (e) {
      setLearners([]);
      setError(e instanceof Error ? e.message : "Failed to load imported learners.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLearners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  async function onSendActivation(learner: ImportedLearner) {
    try {
      setBusyUserId(learner.userId);
      setError(null);
      setInfo(null);
      await sendLearnerActivation(learner.userId);
      setInfo(`Activation email queued for ${learner.email}.`);
      await loadLearners();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send activation email.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learner Onboarding"
        subtitle="Import approved learners, monitor activation status, and issue onboarding emails."
        actions={
          <button
            type="button"
            onClick={() => void loadLearners()}
            disabled={loading}
            className="btn-secondary min-w-[120px]"
            title="Refresh imported learners"
            aria-label="Refresh imported learners"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      <LearnerCsvImportPanel onImported={loadLearners} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Imported" value={summary.total} />
        <SummaryCard label="Pending" value={summary.pending} />
        <SummaryCard label="Invited" value={summary.invited} />
        <SummaryCard label="Activated" value={summary.activated} />
      </div>

      <section className="workspace-scroll-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Imported learners</div>
            <div className="mt-1 text-sm text-white/70">
              Review onboarding visibility and trigger activation per learner.
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
            }}
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]"
          >
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="input-glass"
              placeholder="Search name, email, or student ID"
              aria-label="Search imported learners"
              title="Search imported learners"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="select-glass"
              aria-label="Filter onboarding status"
              title="Filter onboarding status"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary px-4 py-2">
              Search
            </button>
          </form>
        </div>

        {error ? <div className="error-banner mt-4">{error}</div> : null}
        {info ? <div className="info-banner mt-4">{info}</div> : null}

        <div className="divider-soft my-5" />

        <div className="mobile-table-shell max-h-[34rem] overflow-auto rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.54)]">
          <table className="min-w-[64rem] text-sm">
            <thead className="sticky top-0 z-10 bg-[#081A44]/95 text-white/84 backdrop-blur-xl">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Full Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Student ID</th>
                <th className="px-4 py-3 text-left font-medium">Course</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Created Date</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRows />
              ) : learners.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-white/72">
                    No imported learners match the current filters.
                  </td>
                </tr>
              ) : (
                learners.map((learner) => {
                  const isActivated = learner.onboardingStatus === "ACTIVATED";
                  const isBusy = busyUserId === learner.userId;
                  const actionLabel = learner.hasActiveActivationToken
                    ? "Reissue Activation"
                    : "Send Activation";

                  return (
                    <tr
                      key={learner.userId}
                      className="border-t border-[rgba(140,235,255,0.12)] transition hover:bg-[rgba(140,235,255,0.06)]"
                    >
                      <td className="px-4 py-3 text-white">
                        <div className="font-semibold">{learner.learnerName}</div>
                        {learner.externalSource ? (
                          <div className="mt-1 text-xs text-white/48">
                            {learner.externalSource}
                            {learner.externalSourceId ? ` | ${learner.externalSourceId}` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-white/76">{learner.email}</td>
                      <td className="px-4 py-3 text-white/76">
                        {learner.studentNumber || "Not assigned"}
                      </td>
                      <td className="px-4 py-3 text-white/76">{courseLabel(learner)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            "rounded-full border px-3 py-1 text-[11px] font-semibold",
                            statusTone(learner.onboardingStatus),
                          ].join(" ")}
                        >
                          {statusLabel(learner.onboardingStatus)}
                        </span>
                        {learner.hasActiveActivationToken ? (
                          <div className="mt-1 text-xs text-white/48">Active invite token</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-white/64">{formatDate(learner.createdAt)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void onSendActivation(learner)}
                          disabled={isBusy || isActivated || !learner.canReissueActivation}
                          className="btn-primary px-3 py-2 text-xs disabled:opacity-60"
                          title={isActivated ? "Learner is already activated" : actionLabel}
                          aria-label={`${actionLabel} for ${learner.email}`}
                        >
                          {isBusy ? "Sending..." : isActivated ? "Activated" : actionLabel}
                        </button>
                        {learner.activationInvitedAt ? (
                          <div className="mt-2 text-xs text-white/46">
                            Last invited {formatDate(learner.activationInvitedAt)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
