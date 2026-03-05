// src/pages/parent/ParentFinance.tsx
import { useEffect, useState } from "react";
import {
  downloadFinanceStatement,
  getFinance,
  listMyChildren,
  type FinanceSummary,
  type ParentChild,
} from "../../api/parent";
import { toInlineError } from "./errorText";

function childIdentifier(child: ParentChild): string {
  const v = child.childUserId ?? child.studentUserId ?? child.userId ?? child.id;
  return typeof v === "string" ? v.trim() : "";
}

function childLabel(child: ParentChild): string {
  return child.publicStudentId ? `${child.publicStudentId} (${child.email})` : child.email;
}

export default function ParentFinance() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingFinance, setLoadingFinance] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const hasChildren = children.length > 0;

  async function loadFinanceForChild(targetChildId: string) {
    if (!targetChildId) {
      setFinance(null);
      setFinanceError(null);
      setLoadingFinance(false);
      return;
    }

    setLoadingFinance(true);
    setFinanceError(null);
    try {
      const data = await getFinance(targetChildId);
      setFinance(data);
    } catch (e) {
      setFinanceError(toInlineError(e, "Failed to load finance"));
      setFinance(null);
    } finally {
      setLoadingFinance(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadChildren() {
      setLoadingChildren(true);
      setChildrenError(null);
      try {
        const list = await listMyChildren();
        if (cancelled) return;

        setChildren(Array.isArray(list) ? list : []);
        const first = (Array.isArray(list) ? list : []).map(childIdentifier).find(Boolean) ?? "";
        setSelectedChildId(first);
      } catch (e) {
        if (!cancelled) {
          setChildrenError(toInlineError(e, "Failed to load children"));
          setChildren([]);
          setSelectedChildId("");
        }
      } finally {
        if (!cancelled) setLoadingChildren(false);
      }
    }

    void loadChildren();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedChildId) {
      setFinance(null);
      setFinanceError(null);
      setLoadingFinance(false);
      return;
    }

    let cancelled = false;

    async function loadFinance() {
      setLoadingFinance(true);
      setFinanceError(null);
      try {
        const data = await getFinance(selectedChildId);
        if (cancelled) return;
        setFinance(data);
      } catch (e) {
        if (!cancelled) {
          setFinanceError(toInlineError(e, "Failed to load finance"));
          setFinance(null);
        }
      } finally {
        if (!cancelled) setLoadingFinance(false);
      }
    }

    void loadFinance();
    return () => {
      cancelled = true;
    };
  }, [selectedChildId]);

  const status = finance?.status ?? "OK";
  const badge =
    status === "OVERDUE"
      ? "bg-red-950/40 border-red-700/40 text-red-200"
      : "bg-emerald-950/40 border-emerald-700/40 text-emerald-200";

  async function onDownloadStatement() {
    if (!selectedChildId) return;

    setDownloadError(null);
    setDownloading(true);
    try {
      const { blob, fileName } = await downloadFinanceStatement(selectedChildId);
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName || `finance-statement-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setDownloadError(toInlineError(e, "Failed to download statement"));
    } finally {
      setDownloading(false);
    }
  }

  const notifications = Array.isArray(finance?.notifications) ? finance.notifications : [];
  const documents = Array.isArray(finance?.documents) ? finance.documents : [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Child</div>
        <div className="mt-1 text-sm text-slate-400">Select a linked child to view finance.</div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50 sm:max-w-md"
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

          <button
            type="button"
            onClick={() => {
              void loadFinanceForChild(selectedChildId);
            }}
            disabled={!selectedChildId || loadingFinance}
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-900/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh
          </button>

          {childrenError && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-2 text-sm text-red-200">
              {childrenError}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-white">Account Status</div>
            <div className="mt-1 text-sm text-slate-400">
              Finance documents + status notifications.
            </div>
          </div>

          <div className={["rounded-full border px-3 py-1 text-xs font-semibold", badge].join(" ")}>
            {status}
          </div>
        </div>

        {!selectedChildId && !loadingChildren && (
          !hasChildren ? (
            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
              No linked children found. Link a child first to view finance.
            </div>
          ) : (
          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
            Select a child to view this information.
          </div>
          )
        )}

        {loadingFinance && (
          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
            Loading finance...
          </div>
        )}

        {financeError && (
          <div className="mt-5 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
            {financeError}
          </div>
        )}

        {finance && !loadingFinance && !financeError && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Balance" value={`R ${finance.balance.toFixed(2)}`} />
            <Stat label="Statements" value={`${finance.statements}`} />
            <Stat
              label="Last payment"
              value={finance.lastPayment ? new Date(finance.lastPayment).toLocaleDateString() : "N/A"}
            />
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onDownloadStatement}
            disabled={!selectedChildId || loadingFinance || downloading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? "Downloading..." : "Download statement"}
          </button>
        </div>

        {downloadError && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
            {downloadError}
          </div>
        )}

        {import.meta.env.DEV && (
          <details className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <summary className="cursor-pointer text-xs text-slate-400">Debug: finance payload</summary>
            <pre className="mt-2 max-h-56 overflow-auto text-xs text-slate-300">
              {JSON.stringify(finance, null, 2)}
            </pre>
          </details>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Notifications</div>
        <div className="mt-2 text-sm text-slate-400">
          Billing and status notifications for the selected child.
        </div>

        <div className="mt-4 space-y-3">
          {!selectedChildId ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
              Select a child to view this information.
            </div>
          ) : !finance || notifications.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
              No finance records found.
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="text-sm font-semibold text-white">{n.title}</div>
                <div className="mt-1 text-sm text-slate-300">{n.body}</div>
                <div className="mt-2 text-xs uppercase tracking-wide text-slate-400">{n.severity}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Documents</div>
        <div className="mt-2 text-sm text-slate-400">
          Statements and related finance transactions for the selected child.
        </div>

        <div className="mt-4 space-y-3">
          {!selectedChildId ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
              Select a child to view this information.
            </div>
          ) : !finance || documents.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
              No finance records found.
            </div>
          ) : (
            documents.map((d) => (
              <div key={d.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{d.type}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {d.occurredAt ? new Date(d.occurredAt).toLocaleString() : "Unknown date"}
                    </div>
                    {d.description && <div className="mt-2 text-sm text-slate-300">{d.description}</div>}
                  </div>

                  <div className="text-right text-sm font-semibold text-white">
                    R {d.amount.toFixed(2)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
