import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createLinkRequest,
  getFinance,
  getResults,
  listLinkRequests,
  listMyChildren,
  type FinanceSummary,
  type LinkRequest,
  type ParentChild,
  type Result,
} from "../../api/parent";

function childIdentifier(child: ParentChild): string {
  return (child.publicStudentId ?? child.email).trim();
}

function childLabel(child: ParentChild): string {
  return child.publicStudentId ? `${child.publicStudentId} (${child.email})` : child.email;
}

function requestClass(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === "APPROVED") return "border-green-700/40 bg-green-950/30 text-green-200";
  if (normalized === "REJECTED") return "border-red-700/40 bg-red-950/30 text-red-200";
  return "border-yellow-700/40 bg-yellow-950/30 text-yellow-200";
}

export default function ParentOverview() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [linkRequests, setLinkRequests] = useState<LinkRequest[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [linkChildId, setLinkChildId] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);

  async function refreshChildrenAndRequests(preferredChildId?: string) {
    const [nextChildren, nextRequests] = await Promise.all([listMyChildren(), listLinkRequests()]);
    setChildren(nextChildren);
    setLinkRequests(nextRequests);

    const options = nextChildren.map(childIdentifier).filter(Boolean);
    const preferred = String(preferredChildId ?? "").trim();
    const current = String(selectedChildId).trim();

    let nextSelected = "";
    if (preferred && options.includes(preferred)) nextSelected = preferred;
    else if (current && options.includes(current)) nextSelected = current;
    else nextSelected = options[0] ?? "";

    setSelectedChildId(nextSelected);
    if (!nextSelected) {
      setResults([]);
      setFinance(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadChildrenAndRequests() {
      try {
        setLoadingChildren(true);
        setError(null);

        const [nextChildren, nextRequests] = await Promise.all([listMyChildren(), listLinkRequests()]);
        if (cancelled) return;

        setChildren(nextChildren);
        setLinkRequests(nextRequests);

        const first = nextChildren.map(childIdentifier).find(Boolean) ?? "";
        setSelectedChildId(first);

        if (!first) {
          setResults([]);
          setFinance(null);
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setError(e instanceof Error ? e.message : "Failed to load linked children");
        }
      } finally {
        if (!cancelled) setLoadingChildren(false);
      }
    }

    void loadChildrenAndRequests();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedChildId) return;

    let cancelled = false;

    async function loadChildData() {
      try {
        setLoadingData(true);
        setError(null);

        const [nextResults, nextFinance] = await Promise.all([
          getResults(selectedChildId),
          getFinance(selectedChildId),
        ]);
        if (cancelled) return;

        setResults(Array.isArray(nextResults) ? nextResults : []);
        setFinance(nextFinance);
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setResults([]);
          setFinance(null);
          setError(e instanceof Error ? e.message : "Failed to load parent dashboard data");
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }

    void loadChildData();
    return () => {
      cancelled = true;
    };
  }, [selectedChildId]);

  async function submitLinkRequest() {
    const childId = linkChildId.trim();
    if (!childId) {
      setLinkError("Enter a child email or student ID.");
      setRequestStatus(null);
      return;
    }

    try {
      setLinkBusy(true);
      setLinkError(null);
      setRequestStatus(null);

      const created = await createLinkRequest(childId);
      setRequestStatus(`Request ${created.status} for ${created.childId}`);
      setLinkChildId("");

      await refreshChildrenAndRequests(created.childId);
    } catch (e) {
      console.error(e);
      setLinkError(e instanceof Error ? e.message : "Failed to submit link request");
    } finally {
      setLinkBusy(false);
    }
  }

  const loading = loadingChildren || loadingData;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Finance"
          desc="View balance, statements, and payment status."
          to="/app/parent/finance"
        />
        <Card
          title="Results"
          desc="View assessment scores and term performance."
          to="/app/parent/results"
        />
        <Card
          title="Calendar"
          desc="View campus calendar and add personal notes."
          to="/app/parent/calendar"
        />
        <Card
          title="Children"
          desc="Link children using ID (admin approval required)."
          to="/app/parent/children"
        />

        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <div className="text-lg font-semibold text-white">Tip</div>
          <p className="mt-2 text-sm text-slate-400">
            This portal matches the backend structure: separate endpoints for finance, results, calendar,
            and parent-child linking. No rewrites needed, just swap stores for API.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Link a child</div>
        <div className="mt-2 text-sm text-slate-400">
          Enter a student public ID or child email, then submit for admin approval.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={linkChildId}
            onChange={(e) => setLinkChildId(e.target.value)}
            placeholder="e.g. STU-1001 or student@email.com"
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
          />

          <button
            type="button"
            onClick={submitLinkRequest}
            disabled={linkBusy}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {linkBusy ? "Submitting..." : "Submit request"}
          </button>
        </div>

        {linkError && (
          <div className="mt-3 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
            {linkError}
          </div>
        )}

        {requestStatus && (
          <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">
            {requestStatus}
          </div>
        )}

        <div className="mt-4 space-y-2">
          <div className="text-sm font-semibold text-white">Recent requests</div>
          {linkRequests.length === 0 ? (
            <div className="text-sm text-slate-300">No link requests yet.</div>
          ) : (
            linkRequests.slice(0, 5).map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 p-3"
              >
                <div className="text-sm text-slate-200">
                  {req.childId}
                  <div className="mt-1 text-xs text-slate-400">
                    Requested: {new Date(req.requestedAt).toLocaleString()}
                  </div>
                </div>
                <div className={["rounded-full border px-3 py-1 text-xs font-semibold", requestClass(req.status)].join(" ")}>
                  {req.status}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Child</div>
        <div className="mt-2 text-sm text-slate-400">Select a linked child to load dashboard data.</div>
        <select
          value={selectedChildId}
          onChange={(e) => setSelectedChildId(e.target.value)}
          className="mt-4 w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50 sm:max-w-md"
          disabled={loadingChildren || children.length === 0}
        >
          {children.length === 0 ? (
            <option value="">
              {loadingChildren ? "Loading linked children..." : "No linked children found"}
            </option>
          ) : (
            children.map((c) => (
              <option key={c.id} value={childIdentifier(c)}>
                {childLabel(c)}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Results</div>
        <div className="mt-2 text-sm text-slate-400">Loaded from parent API.</div>

        {loading && <div className="mt-3 text-sm text-slate-300">Loading...</div>}
        {error && <div className="mt-3 text-sm text-red-300">{error}</div>}
        {!selectedChildId && !loadingChildren && (
          <div className="mt-3 text-sm text-slate-300">Link a child first to view results.</div>
        )}

        {!loading && !error && Boolean(selectedChildId) && (
          <div className="mt-4 space-y-2">
            {results.length === 0 ? (
              <div className="text-sm text-slate-300">No results found.</div>
            ) : (
              results.map((r) => (
                <div key={r.id} className="text-sm text-slate-200">
                  {r.subject} - {r.score}/{r.outOf}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Finance</div>
        <div className="mt-2 text-sm text-slate-400">Loaded from parent API.</div>

        {!selectedChildId && !loadingChildren ? (
          <div className="mt-4 text-sm text-slate-300">Link a child first to view finance.</div>
        ) : finance ? (
          <div className="mt-4 text-sm text-slate-200">
            Balance: {finance.balance}
            <br />
            Status: {finance.status}
          </div>
        ) : (
          !loading && !error && <div className="mt-4 text-sm text-slate-300">No finance data found.</div>
        )}
      </div>
    </div>
  );
}

function Card({ title, desc, to }: { title: string; desc: string; to: string }) {
  return (
    <Link
      to={to}
      className="block rounded-2xl border border-slate-800 bg-slate-950/30 p-5 transition hover:bg-slate-900/40"
    >
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm text-slate-400">{desc}</div>
      <div className="mt-4 text-sm font-semibold text-blue-400 underline">
        Open {title}
      </div>
    </Link>
  );
}
