// src/pages/AdminParentLinks.tsx
// Admin-only parent-child link approval page.
// Responsibilities:
// - Load link requests by status filter
// - Show pending count for the current view
// - Approve or reject pending requests
// - Display status notices and errors
// - Match the neon glass app theme

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import {
  decideAdminLinkRequest,
  listAdminLinkRequests,
  type AdminLinkRequest,
  type AdminLinkRequestDecision,
  type AdminLinkRequestStatusFilter,
} from "../api/parent";
import { toInlineError } from "./parent/errorText";

const FILTERS: AdminLinkRequestStatusFilter[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "ALL",
];

export default function AdminParentLinks() {
  const [filter, setFilter] = useState<AdminLinkRequestStatusFilter>("PENDING");
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<AdminLinkRequest[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const rows = await listAdminLinkRequests(filter);
      setRequests(rows);
    } catch (e) {
      setError(toInlineError(e, "Failed to load parent link requests"));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(
    () =>
      requests.filter((r) => String(r.status).toUpperCase() === "PENDING")
        .length,
    [requests]
  );

  async function decide(
    row: AdminLinkRequest,
    decision: AdminLinkRequestDecision
  ) {
    setError(null);
    setNotice(null);
    setBusyId(row.id);

    try {
      const out = await decideAdminLinkRequest(row.id, decision);
      setNotice(`Request ${row.id} marked ${out.status}.`);
      await load();
    } catch (e) {
      setError(toInlineError(e, "Failed to update link request"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parent Link Approvals"
        subtitle="Admin-only queue to approve or reject parent-to-child link requests."
      />

      <div className="teal-glow-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-white/78">
            Pending in current view:{" "}
            <span className="font-semibold text-white">{pendingCount}</span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="statusFilter" className="text-sm text-white/82">
              Status
            </label>

            <select
              id="statusFilter"
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as AdminLinkRequestStatusFilter)
              }
              className="select-glass px-4 py-2.5 text-sm"
              aria-label="Filter requests by status"
              title="Filter requests by status"
            >
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="error-banner mt-4">{error}</div>}

        {notice && <div className="info-banner mt-4">{notice}</div>}

        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-[#8CEBFF]/16 bg-[rgba(8,18,48,0.58)] p-5 text-white/78 backdrop-blur-xl">
              Loading requests...
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl border border-[#8CEBFF]/16 bg-[rgba(8,18,48,0.58)] p-5 text-white/78 backdrop-blur-xl">
              No link requests found for this filter.
            </div>
          ) : (
            requests.map((r) => {
              const isPending = String(r.status).toUpperCase() === "PENDING";
              const isBusy = busyId === r.id;

              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-[#8CEBFF]/18 bg-[rgba(8,18,48,0.64)] p-4 text-white shadow-[0_0_16px_rgba(140,235,255,0.08),0_12px_28px_rgba(3,10,28,0.30)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#8CEBFF]/30 hover:shadow-[0_0_20px_rgba(140,235,255,0.14),0_14px_32px_rgba(3,10,28,0.34)]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm text-white/78">
                        Parent:{" "}
                        <span className="font-semibold text-white">
                          {r.parentEmail}
                        </span>
                      </div>

                      <div className="text-sm text-white/78">
                        Child:{" "}
                        <span className="font-semibold text-white">
                          {r.childId}
                        </span>{" "}
                        <span className="text-white/58">({r.childEmail})</span>
                      </div>

                      <div className="text-xs text-white/55">
                        Requested: {new Date(r.requestedAt).toLocaleString()}
                        {r.decidedAt
                          ? ` | Decided: ${new Date(
                              r.decidedAt
                            ).toLocaleString()}`
                          : ""}
                        {r.decidedByEmail ? ` by ${r.decidedByEmail}` : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />

                      {isPending && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void decide(r, "APPROVED")}
                            className="btn-primary px-3 py-2 text-xs disabled:opacity-60"
                            title="Approve request"
                            aria-label="Approve request"
                          >
                            Approve
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void decide(r, "REJECTED")}
                            className="btn-danger px-3 py-2 text-xs disabled:opacity-60"
                            title="Reject request"
                            aria-label="Reject request"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = String(status).toUpperCase();

  const klass =
    normalized === "APPROVED"
      ? "border-emerald-400/25 bg-emerald-500/12 text-emerald-200"
      : normalized === "REJECTED"
      ? "border-rose-400/25 bg-rose-500/12 text-rose-200"
      : "border-amber-400/25 bg-amber-500/12 text-amber-200";

  return (
    <span
      className={[
        "rounded-full border px-3 py-1 text-xs font-semibold shadow-[0_0_10px_rgba(255,255,255,0.03)]",
        klass,
      ].join(" ")}
    >
      {normalized}
    </span>
  );
}