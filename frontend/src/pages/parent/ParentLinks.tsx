// src/pages/parent/ParentLinks.tsx
// Parent -> request to link a child using child ID.
// Admin must approve before the child appears as "linked".

import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { getUser } from "../../lib/auth";
import { createLinkRequest, listLinkRequests, type LinkRequest } from "../../api/parent";
import { toInlineError } from "./errorText";

type LinkStatus = "PENDING" | "APPROVED" | "REJECTED";

function normalizeStatus(status: string): LinkStatus {
  const s = status.toUpperCase();
  if (s === "APPROVED") return "APPROVED";
  if (s === "REJECTED") return "REJECTED";
  return "PENDING";
}

export default function ParentLinks() {
  const user = getUser();
  const parentEmail = user?.email?.trim().toLowerCase() || "not available";

  const [childId, setChildId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [requests, setRequests] = useState<LinkRequest[]>([]);

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const rows = await listLinkRequests();
      setRequests(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(toInlineError(e, "Failed to load link requests"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequests();
  }, []);

  const myRequests = useMemo(() => {
    return [...requests].sort((a, b) => {
      return String(b.requestedAt).localeCompare(String(a.requestedAt));
    });
  }, [requests]);

  async function submit() {
    setError(null);
    setSuccess(null);

    const idTrim = childId.trim();
    if (!idTrim) {
      setError("Enter the child ID you want to link.");
      return;
    }

    setBusy(true);
    try {
      const created = await createLinkRequest(idTrim);
      setChildId("");
      setSuccess(`Request ${created.status} for ${created.childId}`);
      await loadRequests();
    } catch (e) {
      setError(toInlineError(e, "Failed to submit link request"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Link a Child"
        subtitle="Request linking using the child's ID. Admin approval is required."
      />

      {/* Request form */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Request link</div>
        <div className="mt-1 text-sm text-slate-400">
          This is more secure than linking by email. The admin must approve the request.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            placeholder="Enter child ID (e.g. STU-1001)"
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
          />

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Submitting..." : "Submit request"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 rounded-xl border border-emerald-700/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">
            {success}
          </div>
        )}

        <div className="mt-3 text-xs text-slate-500">
          Signed in as: <span className="text-slate-200">{parentEmail}</span>
        </div>
      </div>

      {/* Request status list */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Your requests</div>
        <div className="mt-1 text-sm text-slate-400">
          Pending requests will become "Approved" only after admin action.
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-slate-300">
              Loading requests...
            </div>
          ) : myRequests.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-slate-300">
              No link requests yet.
            </div>
          ) : (
            myRequests.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-white font-semibold">Child ID: {r.childId}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      Requested: {new Date(r.requestedAt).toLocaleString()}
                    </div>
                  </div>

                  <StatusBadge status={normalizeStatus(r.status)} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: LinkStatus }) {
  const klass =
    status === "APPROVED"
      ? "border-green-700/40 bg-green-950/30 text-green-200"
      : status === "REJECTED"
      ? "border-red-700/40 bg-red-950/30 text-red-200"
      : "border-yellow-700/40 bg-yellow-950/30 text-yellow-200";

  return (
    <div className={["rounded-full border px-3 py-1 text-xs font-semibold", klass].join(" ")}>
      {status}
    </div>
  );
}
