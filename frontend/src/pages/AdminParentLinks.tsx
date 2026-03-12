// src/pages/AdminParentLinks.tsx
// Admin-only parent-child link approval page.
// Responsibilities:
// - Load link requests by status filter
// - Show pending count for the current view
// - Approve or reject pending requests
// - Display status notices and errors
// - Use white cards with subtle purple border/shadow styling

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

      <div className="rounded-3xl border border-[#d9ccff] bg-white p-5 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-700">
            Pending in current view:{" "}
            <span className="font-semibold text-slate-900">{pendingCount}</span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="statusFilter" className="text-sm text-slate-700">
              Status
            </label>

            <select
              id="statusFilter"
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as AdminLinkRequestStatusFilter)
              }
              className="rounded-xl border border-[#d9dde5] bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
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

        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {notice && (
          <div className="mt-4 rounded-xl border border-[#bfeaf3] bg-[#eefbfd] p-3 text-sm text-slate-800">
            {notice}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-5 text-slate-700">
              Loading requests...
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-5 text-slate-700">
              No link requests found for this filter.
            </div>
          ) : (
            requests.map((r) => {
              const isPending = String(r.status).toUpperCase() === "PENDING";
              const isBusy = busyId === r.id;

              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-[#e2d8ff] bg-white p-4 text-slate-900 shadow-[0_8px_20px_rgba(121,77,250,0.06)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#cbb8ff]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm text-slate-700">
                        Parent:{" "}
                        <span className="font-semibold text-slate-900">
                          {r.parentEmail}
                        </span>
                      </div>

                      <div className="text-sm text-slate-700">
                        Child:{" "}
                        <span className="font-semibold text-slate-900">
                          {r.childId}
                        </span>{" "}
                        <span className="text-slate-500">({r.childEmail})</span>
                      </div>

                      <div className="text-xs text-slate-500">
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
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "REJECTED"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span
      className={[
        "rounded-full border px-3 py-1 text-xs font-semibold",
        klass,
      ].join(" ")}
    >
      {normalized}
    </span>
  );
}