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
  return child.publicStudentId
    ? `${child.publicStudentId} (${child.email})`
    : child.email;
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
        const first =
          (Array.isArray(list) ? list : []).map(childIdentifier).find(Boolean) ?? "";
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
      ? "bg-red-50 border-red-200 text-red-700"
      : "bg-emerald-50 border-emerald-200 text-emerald-700";

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
        a.download =
          fileName || `finance-statement-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const notifications = Array.isArray(finance?.notifications)
    ? finance.notifications
    : [];
  const documents = Array.isArray(finance?.documents) ? finance.documents : [];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[#d9ccff] bg-white p-5 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
        <div className="text-lg font-semibold text-slate-900">Child</div>
        <div className="mt-1 text-sm text-slate-600">
          Select a linked child to view finance.
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            id="parent-finance-child"
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="w-full rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15 sm:max-w-md"
            disabled={loadingChildren || children.length === 0}
            aria-label="Select child for finance"
            title="Select child for finance"
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

          <button
            type="button"
            onClick={() => {
              void loadFinanceForChild(selectedChildId);
            }}
            disabled={!selectedChildId || loadingFinance}
            className="btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh
          </button>

          {childrenError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {childrenError}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-[#d9ccff] bg-white p-5 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Account Status</div>
            <div className="mt-1 text-sm text-slate-600">
              Finance documents + status notifications.
            </div>
          </div>

          <div
            className={[
              "rounded-full border px-3 py-1 text-xs font-semibold",
              badge,
            ].join(" ")}
          >
            {status}
          </div>
        </div>

        {!selectedChildId && !loadingChildren &&
          (!hasChildren ? (
            <div className="mt-5 rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-4 text-sm text-slate-700">
              No linked children found. Link a child first to view finance.
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-4 text-sm text-slate-700">
              Select a child to view this information.
            </div>
          ))}

        {loadingFinance && (
          <div className="mt-5 rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-4 text-sm text-slate-700">
            Loading finance...
          </div>
        )}

        {financeError && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {financeError}
          </div>
        )}

        {finance && !loadingFinance && !financeError && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Balance" value={`R ${finance.balance.toFixed(2)}`} />
            <Stat label="Statements" value={`${finance.statements}`} />
            <Stat
              label="Last payment"
              value={
                finance.lastPayment
                  ? new Date(finance.lastPayment).toLocaleDateString()
                  : "N/A"
              }
            />
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onDownloadStatement}
            disabled={!selectedChildId || loadingFinance || downloading}
            className="btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? "Downloading..." : "Download statement"}
          </button>
        </div>

        {downloadError && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {downloadError}
          </div>
        )}

        {import.meta.env.DEV && (
          <details className="mt-4 rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-3">
            <summary className="cursor-pointer text-xs text-slate-600">
              Debug: finance payload
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto text-xs text-slate-800">
              {JSON.stringify(finance, null, 2)}
            </pre>
          </details>
        )}
      </div>

      <div className="rounded-3xl border border-[#d9ccff] bg-white p-5 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
        <div className="text-lg font-semibold text-slate-900">Notifications</div>
        <div className="mt-2 text-sm text-slate-600">
          Billing and status notifications for the selected child.
        </div>

        <div className="mt-4 space-y-3">
          {!selectedChildId ? (
            <div className="rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-4 text-sm text-slate-700">
              Select a child to view this information.
            </div>
          ) : !finance || notifications.length === 0 ? (
            <div className="rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-4 text-sm text-slate-700">
              No finance records found.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className="rounded-2xl border border-[#e2d8ff] bg-white p-4 shadow-[0_8px_20px_rgba(121,77,250,0.06)]"
              >
                <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                <div className="mt-1 text-sm text-slate-700">{n.body}</div>
                <div className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                  {n.severity}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-[#d9ccff] bg-white p-5 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
        <div className="text-lg font-semibold text-slate-900">Documents</div>
        <div className="mt-2 text-sm text-slate-600">
          Statements and related finance transactions for the selected child.
        </div>

        <div className="mt-4 space-y-3">
          {!selectedChildId ? (
            <div className="rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-4 text-sm text-slate-700">
              Select a child to view this information.
            </div>
          ) : !finance || documents.length === 0 ? (
            <div className="rounded-2xl border border-[#e2d8ff] bg-[#faf8ff] p-4 text-sm text-slate-700">
              No finance records found.
            </div>
          ) : (
            documents.map((d) => (
              <div
                key={d.id}
                className="rounded-2xl border border-[#e2d8ff] bg-white p-4 shadow-[0_8px_20px_rgba(121,77,250,0.06)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{d.type}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {d.occurredAt
                        ? new Date(d.occurredAt).toLocaleString()
                        : "Unknown date"}
                    </div>
                    {d.description && (
                      <div className="mt-2 text-sm text-slate-700">
                        {d.description}
                      </div>
                    )}
                  </div>

                  <div className="text-right text-sm font-semibold text-slate-900">
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
    <div className="rounded-2xl border border-[#e2d8ff] bg-white p-4 shadow-[0_8px_20px_rgba(121,77,250,0.06)]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}