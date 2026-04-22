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
  return child.publicStudentId
    ? `${child.publicStudentId} (${child.email})`
    : child.email;
}

function requestClass(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "APPROVED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  }
  if (normalized === "REJECTED") {
    return "border-rose-400/30 bg-rose-500/10 text-rose-200";
  }
  return "border-amber-400/30 bg-amber-500/10 text-amber-200";
}

export default function ParentOverview() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [linkRequests, setLinkRequests] = useState<LinkRequest[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [linkSouthAfricanId, setLinkSouthAfricanId] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);

  async function refreshChildrenAndRequests(preferredChildId?: string) {
    const [nextChildren, nextRequests] = await Promise.all([
      listMyChildren(),
      listLinkRequests(),
    ]);
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

        const [nextChildren, nextRequests] = await Promise.all([
          listMyChildren(),
          listLinkRequests(),
        ]);
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
          setError(
            e instanceof Error ? e.message : "Failed to load linked children"
          );
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
          setResults([]);
          setFinance(null);
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load parent dashboard data"
          );
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
    const southAfricanId = linkSouthAfricanId.replace(/\D+/g, "");
    if (!southAfricanId) {
      setLinkError("Enter a student South African ID.");
      setRequestStatus(null);
      return;
    }
    if (!/^\d{13}$/.test(southAfricanId)) {
      setLinkError("South African ID must be exactly 13 digits.");
      setRequestStatus(null);
      return;
    }

    try {
      setLinkBusy(true);
      setLinkError(null);
      setRequestStatus(null);

      const created = await createLinkRequest(southAfricanId);
      setRequestStatus(`Request ${created.status} for SA ID ${created.childId}`);
      setLinkSouthAfricanId("");

      await refreshChildrenAndRequests(created.childId);
    } catch (e) {
      setLinkError(
        e instanceof Error ? e.message : "Failed to submit link request"
      );
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
          title="Attendance"
          desc="Track present, absent, and late history for linked children."
          to="/app/parent/attendance"
        />
        <Card
          title="Children"
          desc="Link children using South African ID with admin approval."
          to="/app/parent/children"
        />

      </div>

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">Link a child</div>
        <div className="mt-2 text-sm text-white/72">
          Enter a student&apos;s South African ID, then submit for admin
          approval.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <input
            id="parent-overview-sa-id"
            value={linkSouthAfricanId}
            onChange={(e) => setLinkSouthAfricanId(e.target.value)}
            placeholder="e.g. 0012311234088"
            className="input-glass"
            aria-label="Student South African ID"
            title="Student South African ID"
          />

          <button
            type="button"
            onClick={submitLinkRequest}
            disabled={linkBusy}
            className="btn-primary px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {linkBusy ? "Submitting..." : "Submit request"}
          </button>
        </div>

        {linkError && <div className="error-banner mt-3">{linkError}</div>}
        {requestStatus && <div className="info-banner mt-3">{requestStatus}</div>}

        <div className="mt-4 space-y-2">
          <div className="text-sm font-semibold text-white">Recent requests</div>
          {linkRequests.length === 0 ? (
            <div className="text-sm text-white/72">No link requests yet.</div>
          ) : (
            linkRequests.slice(0, 5).map((req) => (
              <div
                key={req.id}
                className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-3 shadow-[0_0_18px_rgba(140,235,255,0.08)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-white">
                    {req.childId}
                    <div className="mt-1 text-xs text-white/60">
                      Requested: {new Date(req.requestedAt).toLocaleString()}
                    </div>
                  </div>
                  <div
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-semibold",
                      requestClass(req.status),
                    ].join(" ")}
                  >
                    {req.status}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">Child</div>
        <div className="mt-2 text-sm text-white/72">
          Select a linked child to load dashboard data.
        </div>

        <select
          id="parent-overview-child"
          value={selectedChildId}
          onChange={(e) => setSelectedChildId(e.target.value)}
          className="input-glass mt-4 w-full sm:max-w-md"
          disabled={loadingChildren || children.length === 0}
          aria-label="Select linked child"
          title="Select linked child"
        >
          {children.length === 0 ? (
            <option value="">
              {loadingChildren
                ? "Loading linked children..."
                : "No linked children found"}
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

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">Results</div>
        <div className="mt-2 text-sm text-white/72">Loaded from parent API.</div>

        {loading && <div className="mt-3 text-sm text-white/72">Loading...</div>}
        {error && <div className="mt-3 text-sm text-rose-200">{error}</div>}
        {!selectedChildId && !loadingChildren && (
          <div className="mt-3 text-sm text-white/72">
            Link a child first to view results.
          </div>
        )}

        {!loading && !error && Boolean(selectedChildId) && (
          <div className="mt-4 space-y-2">
            {results.length === 0 ? (
              <div className="text-sm text-white/72">No results found.</div>
            ) : (
              results.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] px-4 py-3 text-sm text-white"
                >
                  {r.subject} - {r.score}/{r.outOf}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">Finance</div>
        <div className="mt-2 text-sm text-white/72">Loaded from parent API.</div>

        {!selectedChildId && !loadingChildren ? (
          <div className="mt-4 text-sm text-white/72">
            Link a child first to view finance.
          </div>
        ) : finance ? (
          <div className="mt-4 text-sm text-white">
            Balance: {finance.balance}
            <br />
            Status: {finance.status}
          </div>
        ) : (
          !loading &&
          !error && (
            <div className="mt-4 text-sm text-white/72">
              No finance data found.
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Card({ title, desc, to }: { title: string; desc: string; to: string }) {
  return (
    <Link
      to={to}
      className="block rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-5 text-white shadow-[0_0_18px_rgba(140,235,255,0.08)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.34)] hover:bg-[rgba(14,42,99,0.62)] hover:shadow-[0_0_22px_rgba(140,235,255,0.12)]"
    >
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm text-white/72">{desc}</div>
      <div className="mt-4 text-sm font-semibold text-[#8CEBFF] underline">
        Open {title}
      </div>
    </Link>
  );
}
