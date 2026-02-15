// src/pages/parent/ParentFinance.tsx
import { useMemo } from "react";

/**
 * ✅ Finance tab (frontend-first).
 * Right now we show demo data so the UI is ready and presentable.
 * Later your brother will connect this to the backend endpoint.
 */
export default function ParentFinance() {
  // Demo data for now (replace with hook later)
  const data = useMemo(() => {
    return {
      balance: 2450.0,
      status: "OVERDUE" as "OK" | "OVERDUE",
      lastPaymentAt: new Date().toISOString(),
      statementCount: 3,
    };
  }, []);

  const badge =
    data.status === "OVERDUE"
      ? "bg-red-950/40 border-red-700/40 text-red-200"
      : "bg-emerald-950/40 border-emerald-700/40 text-emerald-200";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-white">Account Status</div>
            <div className="mt-1 text-sm text-slate-400">
              Finance documents + status notifications.
            </div>
          </div>

          <div className={["rounded-full border px-3 py-1 text-xs font-semibold", badge].join(" ")}>
            {data.status}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Balance" value={`R ${data.balance.toFixed(2)}`} />
          <Stat label="Statements" value={`${data.statementCount}`} />
          <Stat label="Last payment" value={new Date(data.lastPaymentAt).toLocaleDateString()} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={() => alert("Demo: backend will generate/download statement PDF later.")}
          >
            Download statement
          </button>

          <button
            type="button"
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-2 text-sm hover:bg-slate-900/50"
            onClick={() => alert("Demo: backend will send notifications later.")}
          >
            View notifications
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Documents</div>
        <div className="mt-2 text-sm text-slate-400">
          When backend is connected: receipts, invoices, statements will appear here.
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
