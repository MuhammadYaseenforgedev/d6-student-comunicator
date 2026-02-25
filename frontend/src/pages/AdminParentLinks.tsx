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

const FILTERS: AdminLinkRequestStatusFilter[] = ["PENDING", "APPROVED", "REJECTED", "ALL"];

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
    () => requests.filter((r) => String(r.status).toUpperCase() === "PENDING").length,
    [requests]
  );

  async function decide(row: AdminLinkRequest, decision: AdminLinkRequestDecision) {
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

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-300">
            Pending in current view: <span className="font-semibold text-white">{pendingCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="statusFilter" className="text-sm text-slate-300">
              Status
            </label>
            <select
              id="statusFilter"
              value={filter}
              onChange={(e) => setFilter(e.target.value as AdminLinkRequestStatusFilter)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600"
            >
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>
        )}

        {notice && (
          <div className="mt-4 rounded-xl border border-emerald-700/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-slate-300">
              Loading requests...
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-slate-300">
              No link requests found for this filter.
            </div>
          ) : (
            requests.map((r) => {
              const isPending = String(r.status).toUpperCase() === "PENDING";
              const isBusy = busyId === r.id;
              return (
                <div key={r.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm text-slate-300">
                        Parent: <span className="font-semibold text-white">{r.parentEmail}</span>
                      </div>
                      <div className="text-sm text-slate-300">
                        Child: <span className="font-semibold text-white">{r.childId}</span>{" "}
                        <span className="text-slate-400">({r.childEmail})</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Requested: {new Date(r.requestedAt).toLocaleString()}
                        {r.decidedAt ? ` | Decided: ${new Date(r.decidedAt).toLocaleString()}` : ""}
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
                            className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold hover:bg-emerald-600 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void decide(r, "REJECTED")}
                            className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold hover:bg-rose-600 disabled:opacity-60"
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
      ? "border-emerald-700/40 bg-emerald-950/30 text-emerald-200"
      : normalized === "REJECTED"
      ? "border-rose-700/40 bg-rose-950/30 text-rose-200"
      : "border-amber-700/40 bg-amber-950/30 text-amber-200";

  return <span className={["rounded-full border px-3 py-1 text-xs font-semibold", klass].join(" ")}>{normalized}</span>;
}
