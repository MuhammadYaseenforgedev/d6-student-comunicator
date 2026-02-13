// src/pages/parent/ParentLinks.tsx
// Parent -> request to link a child using child ID.
// Admin must approve before the child appears as "linked".

import { useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { getUser } from "../../lib/auth";

/**
 * DEV-ONLY STORE (frontend-first):
 * - While backend is being built, we keep link requests in localStorage.
 * - Once backend is ready, replace these helpers with API calls.
 */

const KEY = "d6_parent_link_requests_v1";

type LinkStatus = "PENDING" | "APPROVED" | "REJECTED";

type LinkReq = {
  id: string;
  parentEmail: string;
  childCampusId: string;
  status: LinkStatus;
  createdAt: string;
  note?: string;
};

function loadRequests(): LinkReq[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LinkReq[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRequests(items: LinkReq[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

function makeId() {
  return `lr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ParentLinks() {
  const user = getUser();
  const parentEmail = user?.email?.trim().toLowerCase() ?? "parent@demo.com";

  const [childId, setChildId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter only this parent’s requests
  const myRequests = useMemo(() => {
    return loadRequests()
      .filter((r) => r.parentEmail === parentEmail)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [parentEmail]);

  async function submit() {
    setError(null);

    const idTrim = childId.trim();
    if (!idTrim) {
      setError("Enter the child ID you want to link.");
      return;
    }

    // Prevent duplicates for same parent + same childId while pending/approved
    const existing = loadRequests().find(
      (r) =>
        r.parentEmail === parentEmail &&
        r.childCampusId.toLowerCase() === idTrim.toLowerCase() &&
        (r.status === "PENDING" || r.status === "APPROVED")
    );
    if (existing) {
      setError("You already have a pending/approved request for this child ID.");
      return;
    }

    setBusy(true);
    try {
      const record: LinkReq = {
        id: makeId(),
        parentEmail,
        childCampusId: idTrim,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      };

      const all = loadRequests();
      saveRequests([record, ...all]);

      setChildId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit link request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Link a Child"
        subtitle="Request linking using the child’s ID. Admin approval is required."
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
            className="w-full rounded-lg bg-slate-950 border border-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
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

        <div className="mt-3 text-xs text-slate-500">
          Signed in as: <span className="text-slate-200">{parentEmail}</span>
        </div>
      </div>

      {/* Request status list */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Your requests</div>
        <div className="mt-1 text-sm text-slate-400">
          Pending requests will become “Approved” only after admin action.
        </div>

        <div className="mt-4 space-y-3">
          {myRequests.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-slate-300">
              No link requests yet.
            </div>
          ) : (
            myRequests.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-white font-semibold">Child ID: {r.childCampusId}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      Requested: {new Date(r.createdAt).toLocaleString()}
                    </div>
                    {r.note && <div className="mt-2 text-sm text-slate-300">Note: {r.note}</div>}
                  </div>

                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Backend note: when your brother’s backend is ready, this list will come from{" "}
          <span className="text-slate-200">GET /parent/link-requests</span>.
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
