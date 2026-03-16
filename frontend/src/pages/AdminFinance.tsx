import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import {
  createAdminFinanceDocument,
  createAdminFinanceNotification,
  createAdminFinanceTransaction,
  downloadAdminFinanceStatement,
  getAdminFinanceAccount,
  listAdminFinanceAccounts,
  updateAdminFinanceAccount,
  type AdminFinanceAccount,
  type AdminFinanceDetail,
} from "../lib/adminFinanceApi";

const ACCOUNT_STATUSES = ["OK", "OUTSTANDING", "OVERDUE", "PAYMENT_PLAN", "HOLD"] as const;
const DOCUMENT_TYPES = ["STATEMENT", "INVOICE", "NOTICE", "RECEIPT", "PAYMENT_PLAN"] as const;
const NOTIFICATION_SEVERITIES = ["INFO", "SUCCESS", "WARNING", "URGENT"] as const;

function studentName(account: Pick<AdminFinanceAccount, "firstName" | "lastName" | "studentNumber" | "email">): string {
  const fullName = `${account.firstName ?? ""} ${account.lastName ?? ""}`.trim();
  return fullName || account.studentNumber?.trim() || account.email;
}

function money(amount: number, currency = "ZAR"): string {
  return `${currency} ${amount.toFixed(2)}`;
}

function when(raw: string | null | undefined): string {
  if (!raw) return "N/A";
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toLocaleString() : raw;
}

export default function AdminFinance() {
  const [accounts, setAccounts] = useState<AdminFinanceAccount[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [detail, setDetail] = useState<AdminFinanceDetail | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [balanceInput, setBalanceInput] = useState("0.00");
  const [currencyInput, setCurrencyInput] = useState("ZAR");
  const [statusInput, setStatusInput] = useState<(typeof ACCOUNT_STATUSES)[number]>("OK");
  const [statusNoteInput, setStatusNoteInput] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txOccurredAt, setTxOccurredAt] = useState("");
  const [docType, setDocType] = useState<(typeof DOCUMENT_TYPES)[number]>("STATEMENT");
  const [docTitle, setDocTitle] = useState("");
  const [docDescription, setDocDescription] = useState("");
  const [docAmount, setDocAmount] = useState("");
  const [docIssuedAt, setDocIssuedAt] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteSeverity, setNoteSeverity] = useState<(typeof NOTIFICATION_SEVERITIES)[number]>("INFO");

  async function loadAccounts(preferredId?: string) {
    try {
      setLoadingAccounts(true);
      setError(null);
      const rows = await listAdminFinanceAccounts({ q: search || undefined, limit: 250 });
      setAccounts(rows);
      const target = preferredId || selectedStudentId;
      setSelectedStudentId(rows.some((row) => row.studentId === target) ? target : (rows[0]?.studentId ?? ""));
    } catch (e) {
      setAccounts([]);
      setSelectedStudentId("");
      setError(e instanceof Error ? e.message : "Failed to load finance accounts");
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function loadDetail(studentId: string) {
    if (!studentId) {
      setDetail(null);
      return;
    }
    try {
      setLoadingDetail(true);
      setError(null);
      const next = await getAdminFinanceAccount(studentId);
      setDetail(next);
      setBalanceInput(next.summary.balance.toFixed(2));
      setCurrencyInput(next.summary.currency || "ZAR");
      setStatusInput(
        ACCOUNT_STATUSES.includes(next.summary.status as (typeof ACCOUNT_STATUSES)[number])
          ? (next.summary.status as (typeof ACCOUNT_STATUSES)[number])
          : "OK"
      );
      setStatusNoteInput(next.summary.statusNote ?? "");
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "Failed to load finance detail");
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (selectedStudentId) void loadDetail(selectedStudentId);
    else setDetail(null);
  }, [selectedStudentId]);

  async function refreshAll() {
    await loadAccounts(selectedStudentId);
    if (selectedStudentId) await loadDetail(selectedStudentId);
  }

  async function saveSummary() {
    if (!selectedStudentId) return;
    const balance = Number(balanceInput);
    if (!Number.isFinite(balance)) return setError("Balance must be a valid number.");
    try {
      setBusy("summary");
      setError(null);
      setInfo(null);
      const next = await updateAdminFinanceAccount(selectedStudentId, {
        balance,
        currency: currencyInput.trim().toUpperCase() || "ZAR",
        status: statusInput,
        statusNote: statusNoteInput.trim() || null,
      });
      setDetail(next);
      setInfo("Finance account updated.");
      await loadAccounts(selectedStudentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update finance account");
    } finally {
      setBusy(null);
    }
  }

  async function addTransaction() {
    if (!selectedStudentId) return;
    const amount = Number(txAmount);
    if (!Number.isFinite(amount) || amount === 0) return setError("Enter a non-zero transaction amount.");
    if (!txDescription.trim()) return setError("Transaction description is required.");
    try {
      setBusy("transaction");
      setError(null);
      setInfo(null);
      const response = await createAdminFinanceTransaction(selectedStudentId, {
        amount,
        currency: currencyInput.trim().toUpperCase() || "ZAR",
        description: txDescription.trim(),
        occurredAt: txOccurredAt || undefined,
      });
      if (response.detail) setDetail(response.detail);
      setTxAmount("");
      setTxDescription("");
      setTxOccurredAt("");
      setInfo("Ledger entry recorded.");
      await loadAccounts(selectedStudentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add finance transaction");
    } finally {
      setBusy(null);
    }
  }

  async function addDocument() {
    if (!selectedStudentId) return;
    if (!docTitle.trim()) return setError("Document title is required.");
    const amount = docAmount.trim() === "" ? undefined : Number(docAmount);
    if (amount !== undefined && !Number.isFinite(amount)) return setError("Document amount must be a number.");
    try {
      setBusy("document");
      setError(null);
      setInfo(null);
      const response = await createAdminFinanceDocument(selectedStudentId, {
        type: docType,
        title: docTitle.trim(),
        description: docDescription.trim() || undefined,
        amount,
        currency: currencyInput.trim().toUpperCase() || "ZAR",
        issuedAt: docIssuedAt || undefined,
        documentUrl: docUrl.trim() || undefined,
      });
      if (response.detail) setDetail(response.detail);
      setDocTitle("");
      setDocDescription("");
      setDocAmount("");
      setDocIssuedAt("");
      setDocUrl("");
      setInfo("Finance document sent.");
      await loadAccounts(selectedStudentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send finance document");
    } finally {
      setBusy(null);
    }
  }

  async function addNotification() {
    if (!selectedStudentId) return;
    if (!noteTitle.trim() || !noteBody.trim()) return setError("Notification title and body are required.");
    try {
      setBusy("notification");
      setError(null);
      setInfo(null);
      const response = await createAdminFinanceNotification(selectedStudentId, {
        title: noteTitle.trim(),
        body: noteBody.trim(),
        severity: noteSeverity,
      });
      if (response.detail) setDetail(response.detail);
      setNoteTitle("");
      setNoteBody("");
      setNoteSeverity("INFO");
      setInfo("Finance notification sent.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send finance notification");
    } finally {
      setBusy(null);
    }
  }

  async function downloadStatement() {
    if (!selectedStudentId) return;
    try {
      setBusy("download");
      setError(null);
      const { blob, fileName } = await downloadAdminFinanceStatement(selectedStudentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || `finance-admin-statement-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to download finance statement");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        subtitle="Manage finance accounts for students and send status updates, notifications, and documents to linked parents."
        actions={
          <button
            type="button"
            onClick={() => {
              void refreshAll();
            }}
            disabled={loadingAccounts || loadingDetail}
            className="rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900/70 disabled:opacity-60"
          >
            {loadingAccounts || loadingDetail ? "Refreshing..." : "Refresh"}
          </button>
        }
      />
      {error && <div className="rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}
      {info && (
        <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">{info}</div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search student or parent email"
              className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Search
            </button>
          </form>
          <div className="mt-4 space-y-3">
            {loadingAccounts ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">Loading finance accounts...</div>
            ) : accounts.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">No matching finance accounts.</div>
            ) : (
              accounts.map((account) => (
                <button
                  key={account.studentId}
                  type="button"
                  onClick={() => setSelectedStudentId(account.studentId)}
                  className={[
                    "w-full rounded-2xl border p-4 text-left",
                    account.studentId === selectedStudentId
                      ? "border-cyan-500/40 bg-cyan-950/20"
                      : "border-slate-800 bg-slate-950/40 hover:border-slate-700",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold text-white">{studentName(account)}</div>
                  <div className="mt-1 text-xs text-slate-400">{account.email}</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-300">
                    <span>{money(account.balance, account.currency)}</span>
                    <span>{account.status}</span>
                    <span>{account.parents.length} parent{account.parents.length === 1 ? "" : "s"}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="space-y-6">
          {!selectedStudentId ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-6 text-sm text-slate-300">Select a student account to manage finance.</div>
          ) : loadingDetail ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-6 text-sm text-slate-300">Loading finance detail...</div>
          ) : !detail ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-6 text-sm text-slate-300">Finance detail is unavailable for this account.</div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-white">{studentName(detail.student)}</div>
                    <div className="mt-1 text-sm text-slate-400">{detail.student.email}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {detail.student.studentNumber?.trim() || "No student number"}
                      {detail.student.courseName ? ` • ${detail.student.courseName}` : ""}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
                    {detail.student.parents.length === 0 ? "No linked parents." : detail.student.parents.map((p) => p.email).join(", ")}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><div className="text-xs text-slate-400">Balance</div><div className="mt-2 text-lg font-semibold text-white">{money(detail.summary.balance, detail.summary.currency)}</div></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><div className="text-xs text-slate-400">Status</div><div className="mt-2 text-lg font-semibold text-white">{detail.summary.status}</div></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><div className="text-xs text-slate-400">Statements</div><div className="mt-2 text-lg font-semibold text-white">{detail.summary.statements}</div></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><div className="text-xs text-slate-400">Last payment</div><div className="mt-2 text-lg font-semibold text-white">{when(detail.summary.lastPayment)}</div></div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
                  <div className="text-lg font-semibold text-white">Account</div>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_120px_120px]">
                    <input value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} placeholder="Balance" className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                    <input value={currencyInput} onChange={(e) => setCurrencyInput(e.target.value.toUpperCase())} placeholder="Currency" className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                    <select value={statusInput} onChange={(e) => setStatusInput(e.target.value as (typeof ACCOUNT_STATUSES)[number])} className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm">{ACCOUNT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
                  </div>
                  <textarea value={statusNoteInput} onChange={(e) => setStatusNoteInput(e.target.value)} rows={3} placeholder="Status note visible to parents" className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { void saveSummary(); }} disabled={busy === "summary"} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy === "summary" ? "Saving..." : "Save account"}</button>
                    <button type="button" onClick={() => { void downloadStatement(); }} disabled={busy === "download"} className="rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900/70 disabled:opacity-60">{busy === "download" ? "Downloading..." : "Download statement"}</button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
                  <div className="text-lg font-semibold text-white">Ledger entry</div>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <input value={txAmount} onChange={(e) => setTxAmount(e.target.value)} placeholder="Amount (+charge / -payment)" className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                    <input type="datetime-local" value={txOccurredAt} onChange={(e) => setTxOccurredAt(e.target.value)} className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                  </div>
                  <input value={txDescription} onChange={(e) => setTxDescription(e.target.value)} placeholder="Description" className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                  <button type="button" onClick={() => { void addTransaction(); }} disabled={busy === "transaction"} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{busy === "transaction" ? "Posting..." : "Add transaction"}</button>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
                  <div className="text-lg font-semibold text-white">Send document</div>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <select value={docType} onChange={(e) => setDocType(e.target.value as (typeof DOCUMENT_TYPES)[number])} className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm">{DOCUMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
                    <input type="datetime-local" value={docIssuedAt} onChange={(e) => setDocIssuedAt(e.target.value)} className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                  </div>
                  <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Document title" className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <input value={docAmount} onChange={(e) => setDocAmount(e.target.value)} placeholder="Optional amount" className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                    <input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="Optional document URL" className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                  </div>
                  <textarea value={docDescription} onChange={(e) => setDocDescription(e.target.value)} rows={3} placeholder="Document description" className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                  <button type="button" onClick={() => { void addDocument(); }} disabled={busy === "document"} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy === "document" ? "Sending..." : "Send document"}</button>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
                  <div className="text-lg font-semibold text-white">Send notification</div>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_160px]">
                    <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Notification title" className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                    <select value={noteSeverity} onChange={(e) => setNoteSeverity(e.target.value as (typeof NOTIFICATION_SEVERITIES)[number])} className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm">{NOTIFICATION_SEVERITIES.map((level) => <option key={level}>{level}</option>)}</select>
                  </div>
                  <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={4} placeholder="Message sent to linked parents" className="min-w-0 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" />
                  <button type="button" onClick={() => { void addNotification(); }} disabled={busy === "notification"} className="inline-flex w-fit rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{busy === "notification" ? "Sending..." : "Send notification"}</button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5"><div className="text-lg font-semibold text-white">Documents</div><div className="mt-4 space-y-3">{detail.documents.length === 0 ? <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">No finance documents yet.</div> : detail.documents.map((document) => <div key={document.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-white">{document.title}</div><div className="mt-1 text-xs text-slate-400">{document.type} • {when(document.issuedAt)}</div>{document.description && <div className="mt-2 text-sm text-slate-300">{document.description}</div>}{document.documentUrl && <a href={document.documentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-cyan-200 hover:text-cyan-100">Open document</a>}</div><div className="text-sm font-semibold text-white">{document.amount == null ? "No amount" : money(document.amount, document.currency)}</div></div></div>)}</div></div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5"><div className="text-lg font-semibold text-white">Notifications</div><div className="mt-4 space-y-3">{detail.notifications.length === 0 ? <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">No finance notifications yet.</div> : detail.notifications.map((note) => <div key={note.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-white">{note.title}</div><div className="mt-1 text-sm text-slate-300">{note.body}</div></div><div className="text-right text-xs text-slate-400"><div>{note.severity}</div><div className="mt-1">{when(note.createdAt)}</div></div></div></div>)}</div></div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
                <div className="text-lg font-semibold text-white">Transactions</div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-slate-400"><tr><th className="px-3 py-2 font-medium">Occurred</th><th className="px-3 py-2 font-medium">Description</th><th className="px-3 py-2 font-medium">Amount</th></tr></thead>
                    <tbody>{detail.transactions.length === 0 ? <tr><td colSpan={3} className="px-3 py-4 text-slate-300">No transactions recorded yet.</td></tr> : detail.transactions.map((transaction) => <tr key={transaction.id} className="border-t border-slate-800"><td className="px-3 py-3 text-slate-300">{when(transaction.occurredAt)}</td><td className="px-3 py-3 text-slate-200">{transaction.description}</td><td className="px-3 py-3 font-semibold text-white">{money(transaction.amount, transaction.currency)}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
