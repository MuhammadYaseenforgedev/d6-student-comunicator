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

const ACCOUNT_STATUSES = [
  "OK",
  "OUTSTANDING",
  "OVERDUE",
  "PAYMENT_PLAN",
  "HOLD",
] as const;

const DOCUMENT_TYPES = [
  "STATEMENT",
  "INVOICE",
  "NOTICE",
  "RECEIPT",
  "PAYMENT_PLAN",
] as const;

const NOTIFICATION_SEVERITIES = [
  "INFO",
  "SUCCESS",
  "WARNING",
  "URGENT",
] as const;

function studentName(
  account: Pick<
    AdminFinanceAccount,
    "firstName" | "lastName" | "studentNumber" | "email"
  >
): string {
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

function statusBadgeClass(status: string): string {
  if (status === "OK") {
    return "border-[rgba(52,211,153,0.30)] bg-[rgba(52,211,153,0.14)] text-[#d9fff1]";
  }
  if (status === "OUTSTANDING") {
    return "border-[rgba(255,196,87,0.30)] bg-[rgba(255,196,87,0.14)] text-[#ffecc2]";
  }
  if (status === "OVERDUE" || status === "HOLD") {
    return "border-[rgba(255,102,146,0.30)] bg-[rgba(255,102,146,0.14)] text-[#ffdbe6]";
  }
  if (status === "PAYMENT_PLAN") {
    return "border-[rgba(79,166,255,0.30)] bg-[rgba(79,166,255,0.14)] text-[#d9eeff]";
  }
  return "border-[rgba(148,163,184,0.30)] bg-[rgba(148,163,184,0.14)] text-slate-100";
}

function severityBadgeClass(severity: string): string {
  if (severity === "SUCCESS") {
    return "border-[rgba(52,211,153,0.30)] bg-[rgba(52,211,153,0.14)] text-[#d9fff1]";
  }
  if (severity === "WARNING") {
    return "border-[rgba(255,196,87,0.30)] bg-[rgba(255,196,87,0.14)] text-[#ffecc2]";
  }
  if (severity === "URGENT") {
    return "border-[rgba(255,102,146,0.30)] bg-[rgba(255,102,146,0.14)] text-[#ffdbe6]";
  }
  return "border-[rgba(79,166,255,0.30)] bg-[rgba(79,166,255,0.14)] text-[#d9eeff]";
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
  const [statusInput, setStatusInput] =
    useState<(typeof ACCOUNT_STATUSES)[number]>("OK");
  const [statusNoteInput, setStatusNoteInput] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txOccurredAt, setTxOccurredAt] = useState("");
  const [docType, setDocType] =
    useState<(typeof DOCUMENT_TYPES)[number]>("STATEMENT");
  const [docTitle, setDocTitle] = useState("");
  const [docDescription, setDocDescription] = useState("");
  const [docAmount, setDocAmount] = useState("");
  const [docIssuedAt, setDocIssuedAt] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteSeverity, setNoteSeverity] =
    useState<(typeof NOTIFICATION_SEVERITIES)[number]>("INFO");

  async function loadAccounts(preferredId?: string) {
    try {
      setLoadingAccounts(true);
      setError(null);
      const rows = await listAdminFinanceAccounts({
        q: search || undefined,
        limit: 250,
      });
      setAccounts(rows);
      const target = preferredId || selectedStudentId;
      setSelectedStudentId(
        rows.some((row) => row.studentId === target)
          ? target
          : rows[0]?.studentId ?? ""
      );
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
        ACCOUNT_STATUSES.includes(
          next.summary.status as (typeof ACCOUNT_STATUSES)[number]
        )
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
    if (!Number.isFinite(balance)) {
      setError("Balance must be a valid number.");
      return;
    }
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
    if (!Number.isFinite(amount) || amount === 0) {
      setError("Enter a non-zero transaction amount.");
      return;
    }
    if (!txDescription.trim()) {
      setError("Transaction description is required.");
      return;
    }
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
      setError(
        e instanceof Error ? e.message : "Failed to add finance transaction"
      );
    } finally {
      setBusy(null);
    }
  }

  async function addDocument() {
    if (!selectedStudentId) return;
    if (!docTitle.trim()) {
      setError("Document title is required.");
      return;
    }
    const amount = docAmount.trim() === "" ? undefined : Number(docAmount);
    if (amount !== undefined && !Number.isFinite(amount)) {
      setError("Document amount must be a number.");
      return;
    }
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
    if (!noteTitle.trim() || !noteBody.trim()) {
      setError("Notification title and body are required.");
      return;
    }
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
      setError(
        e instanceof Error ? e.message : "Failed to send finance notification"
      );
    } finally {
      setBusy(null);
    }
  }

  async function downloadStatement() {
    if (!selectedStudentId) return;
    try {
      setBusy("download");
      setError(null);
      const { blob, fileName } = await downloadAdminFinanceStatement(
        selectedStudentId
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        fileName ||
        `finance-admin-statement-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to download finance statement"
      );
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
            className="btn-secondary min-w-[120px]"
            title="Refresh finance data"
            aria-label="Refresh finance data"
          >
            {loadingAccounts || loadingDetail ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      {error && <div className="error-banner">{error}</div>}
      {info && <div className="info-banner">{info}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr]">
        <section className="teal-glow-card p-5">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <label htmlFor="finance-search" className="sr-only">
              Search student or parent email
            </label>
            <input
              id="finance-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search student or parent email"
              className="input-glass min-w-0 flex-1"
              title="Search student or parent email"
              aria-label="Search student or parent email"
            />
            <button type="submit" className="btn-primary min-w-[100px]">
              Search
            </button>
          </form>

          <div className="divider-soft my-5" />

          <div className="space-y-3">
            {loadingAccounts ? (
              <div className="info-banner">Loading finance accounts...</div>
            ) : accounts.length === 0 ? (
              <div className="info-banner">No matching finance accounts.</div>
            ) : (
              accounts.map((account) => (
                <button
                  key={account.studentId}
                  type="button"
                  onClick={() => setSelectedStudentId(account.studentId)}
                  className={[
                    "w-full rounded-3xl border p-4 text-left transition-all duration-200",
                    account.studentId === selectedStudentId
                      ? "border-[rgba(140,235,255,0.30)] bg-[rgba(14,42,99,0.28)] shadow-[0_0_0_1px_rgba(140,235,255,0.05),0_0_18px_rgba(140,235,255,0.08)]"
                      : "border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.50)] hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.24)] hover:bg-[rgba(8,18,48,0.66)]",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold text-white">
                    {studentName(account)}
                  </div>
                  <div className="mt-1 text-xs text-white/60">{account.email}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-[rgba(79,166,255,0.25)] bg-[rgba(79,166,255,0.14)] px-2.5 py-1 text-[11px] font-medium text-[#d9eeff]">
                      {money(account.balance, account.currency)}
                    </span>
                    <span
                      className={[
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                        statusBadgeClass(account.status),
                      ].join(" ")}
                    >
                      {account.status}
                    </span>
                    <span className="rounded-full border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] px-2.5 py-1 text-[11px] text-white/70">
                      {account.parents.length} parent
                      {account.parents.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="space-y-6">
          {!selectedStudentId ? (
            <div className="info-banner">
              Select a student account to manage finance.
            </div>
          ) : loadingDetail ? (
            <div className="info-banner">Loading finance detail...</div>
          ) : !detail ? (
            <div className="info-banner">
              Finance detail is unavailable for this account.
            </div>
          ) : (
            <>
              <div className="teal-glow-card p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {studentName(detail.student)}
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      {detail.student.email}
                    </div>
                    <div className="mt-1 text-xs text-white/50">
                      {detail.student.studentNumber?.trim() || "No student number"}
                      {detail.student.courseName
                        ? ` • ${detail.student.courseName}`
                        : ""}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.56)] px-4 py-3 text-sm text-white/75">
                    {detail.student.parents.length === 0
                      ? "No linked parents."
                      : detail.student.parents.map((p) => p.email).join(", ")}
                  </div>
                </div>

                <div className="divider-soft my-5" />

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div className="glass-panel p-4">
                    <div className="text-xs text-white/55">Balance</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {money(detail.summary.balance, detail.summary.currency)}
                    </div>
                  </div>
                  <div className="glass-panel p-4">
                    <div className="text-xs text-white/55">Status</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {detail.summary.status}
                    </div>
                  </div>
                  <div className="glass-panel p-4">
                    <div className="text-xs text-white/55">Statements</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {detail.summary.statements}
                    </div>
                  </div>
                  <div className="glass-panel p-4">
                    <div className="text-xs text-white/55">Last payment</div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {when(detail.summary.lastPayment)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="teal-glow-card p-5 space-y-4">
                  <div className="text-lg font-semibold text-white">Account</div>

                  <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_120px_120px]">
                    <div className="min-w-0">
                      <label
                        htmlFor="finance-balance"
                        className="mb-2 block text-sm font-medium text-white/80"
                      >
                        Balance
                      </label>
                      <input
                        id="finance-balance"
                        value={balanceInput}
                        onChange={(e) => setBalanceInput(e.target.value)}
                        placeholder="Balance"
                        className="input-glass min-w-0 w-full"
                        title="Balance"
                      />
                    </div>

                    <div className="min-w-0">
                      <label
                        htmlFor="finance-currency"
                        className="mb-2 block text-sm font-medium text-white/80"
                      >
                        Currency
                      </label>
                      <input
                        id="finance-currency"
                        value={currencyInput}
                        onChange={(e) =>
                          setCurrencyInput(e.target.value.toUpperCase())
                        }
                        placeholder="Currency"
                        className="input-glass min-w-0 w-full"
                        title="Currency"
                      />
                    </div>

                    <div className="min-w-0">
                      <label
                        htmlFor="finance-status"
                        className="mb-2 block text-sm font-medium text-white/80"
                      >
                        Status
                      </label>
                      <select
                        id="finance-status"
                        value={statusInput}
                        onChange={(e) =>
                          setStatusInput(
                            e.target.value as (typeof ACCOUNT_STATUSES)[number]
                          )
                        }
                        className="select-glass min-w-0 w-full"
                        title="Account status"
                        aria-label="Account status"
                      >
                        {ACCOUNT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="finance-status-note"
                      className="mb-2 block text-sm font-medium text-white/80"
                    >
                      Status note
                    </label>
                    <textarea
                      id="finance-status-note"
                      value={statusNoteInput}
                      onChange={(e) => setStatusNoteInput(e.target.value)}
                      rows={3}
                      placeholder="Status note visible to parents"
                      className="input-glass min-w-0 w-full resize-none"
                      title="Status note visible to parents"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void saveSummary();
                      }}
                      disabled={busy === "summary"}
                      className="btn-primary"
                    >
                      {busy === "summary" ? "Saving..." : "Save account"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void downloadStatement();
                      }}
                      disabled={busy === "download"}
                      className="btn-secondary"
                    >
                      {busy === "download"
                        ? "Downloading..."
                        : "Download statement"}
                    </button>
                  </div>
                </div>

                <div className="teal-glow-card p-5 space-y-4">
                  <div className="text-lg font-semibold text-white">
                    Ledger entry
                  </div>

                  <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                    <div className="min-w-0">
                      <label
                        htmlFor="finance-tx-amount"
                        className="mb-2 block text-sm font-medium text-white/80"
                      >
                        Amount
                      </label>
                      <input
                        id="finance-tx-amount"
                        value={txAmount}
                        onChange={(e) => setTxAmount(e.target.value)}
                        placeholder="Amount (+charge / -payment)"
                        className="input-glass min-w-0 w-full"
                        title="Transaction amount"
                      />
                    </div>

                    <div className="min-w-0">
                      <label
                        htmlFor="finance-tx-occurred-at"
                        className="mb-2 block text-sm font-medium text-white/80"
                      >
                        Occurred at
                      </label>
                      <input
                        id="finance-tx-occurred-at"
                        type="datetime-local"
                        value={txOccurredAt}
                        onChange={(e) => setTxOccurredAt(e.target.value)}
                        className="input-glass min-w-0 w-full"
                        title="Transaction occurred at"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="finance-tx-description"
                      className="mb-2 block text-sm font-medium text-white/80"
                    >
                      Description
                    </label>
                    <input
                      id="finance-tx-description"
                      value={txDescription}
                      onChange={(e) => setTxDescription(e.target.value)}
                      placeholder="Description"
                      className="input-glass min-w-0 w-full"
                      title="Transaction description"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void addTransaction();
                    }}
                    disabled={busy === "transaction"}
                    className="btn-primary"
                  >
                    {busy === "transaction" ? "Posting..." : "Add transaction"}
                  </button>
                </div>

                <div className="teal-glow-card p-5 space-y-4">
                  <div className="text-lg font-semibold text-white">
                    Send document
                  </div>

                  <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                    <div className="min-w-0">
                      <label
                        htmlFor="finance-doc-type"
                        className="mb-2 block text-sm font-medium text-white/80"
                      >
                        Document type
                      </label>
                      <select
                        id="finance-doc-type"
                        value={docType}
                        onChange={(e) =>
                          setDocType(
                            e.target.value as (typeof DOCUMENT_TYPES)[number]
                          )
                        }
                        className="select-glass min-w-0 w-full"
                        title="Document type"
                        aria-label="Document type"
                      >
                        {DOCUMENT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="min-w-0">
                      <label
                        htmlFor="finance-doc-issued-at"
                        className="mb-2 block text-sm font-medium text-white/80"
                      >
                        Issued at
                      </label>
                      <input
                        id="finance-doc-issued-at"
                        type="datetime-local"
                        value={docIssuedAt}
                        onChange={(e) => setDocIssuedAt(e.target.value)}
                        className="input-glass min-w-0 w-full"
                        title="Document issued at"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="finance-doc-title"
                      className="mb-2 block text-sm font-medium text-white/80"
                    >
                      Document title
                    </label>
                    <input
                      id="finance-doc-title"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="Document title"
                      className="input-glass min-w-0 w-full"
                      title="Document title"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                    <div className="min-w-0">
                      <label
                        htmlFor="finance-doc-amount"
                        className="mb-2 block text-sm font-medium text-white/80"
                      >
                        Optional amount
                      </label>
                      <input
                        id="finance-doc-amount"
                        value={docAmount}
                        onChange={(e) => setDocAmount(e.target.value)}
                        placeholder="Optional amount"
                        className="input-glass min-w-0 w-full"
                        title="Optional document amount"
                      />
                    </div>

                    <div className="min-w-0">
                      <label
                        htmlFor="finance-doc-url"
                        className="mb-2 block text-sm font-medium text-white/80"
                      >
                        Optional document URL
                      </label>
                      <input
                        id="finance-doc-url"
                        value={docUrl}
                        onChange={(e) => setDocUrl(e.target.value)}
                        placeholder="Optional document URL"
                        className="input-glass min-w-0 w-full"
                        title="Optional document URL"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="finance-doc-description"
                      className="mb-2 block text-sm font-medium text-white/80"
                    >
                      Document description
                    </label>
                    <textarea
                      id="finance-doc-description"
                      value={docDescription}
                      onChange={(e) => setDocDescription(e.target.value)}
                      rows={3}
                      placeholder="Document description"
                      className="input-glass min-w-0 w-full resize-none"
                      title="Document description"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void addDocument();
                    }}
                    disabled={busy === "document"}
                    className="btn-primary"
                  >
                    {busy === "document" ? "Sending..." : "Send document"}
                  </button>
                </div>

                <div className="teal-glow-card p-5 space-y-4">
                  <div className="text-lg font-semibold text-white">
                    Send notification
                  </div>

                  <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_160px]">
                    <div className="min-w-0">
                      <label
                        htmlFor="finance-note-title"
                        className="mb-2 block text-sm font-medium text-white/80"
                      >
                        Notification title
                      </label>
                      <input
                        id="finance-note-title"
                        value={noteTitle}
                        onChange={(e) => setNoteTitle(e.target.value)}
                        placeholder="Notification title"
                        className="input-glass min-w-0 w-full"
                        title="Notification title"
                      />
                    </div>

                    <div className="min-w-0">
                      <label
                        htmlFor="finance-note-severity"
                        className="mb-2 block text-sm font-medium text-white/80"
                      >
                        Severity
                      </label>
                      <select
                        id="finance-note-severity"
                        value={noteSeverity}
                        onChange={(e) =>
                          setNoteSeverity(
                            e.target.value as (typeof NOTIFICATION_SEVERITIES)[number]
                          )
                        }
                        className="select-glass min-w-0 w-full"
                        title="Notification severity"
                        aria-label="Notification severity"
                      >
                        {NOTIFICATION_SEVERITIES.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="finance-note-body"
                      className="mb-2 block text-sm font-medium text-white/80"
                    >
                      Message
                    </label>
                    <textarea
                      id="finance-note-body"
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      rows={4}
                      placeholder="Message sent to linked parents"
                      className="input-glass min-w-0 w-full resize-none"
                      title="Message sent to linked parents"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void addNotification();
                    }}
                    disabled={busy === "notification"}
                    className="btn-primary inline-flex w-fit"
                  >
                    {busy === "notification"
                      ? "Sending..."
                      : "Send notification"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="teal-glow-card p-5">
                  <div className="text-lg font-semibold text-white">Documents</div>

                  <div className="mt-4 space-y-3">
                    {detail.documents.length === 0 ? (
                      <div className="info-banner">No finance documents yet.</div>
                    ) : (
                      detail.documents.map((document) => (
                        <div
                          key={document.id}
                          className="glass-panel p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">
                                {document.title}
                              </div>
                              <div className="mt-1 text-xs text-white/55">
                                {document.type} • {when(document.issuedAt)}
                              </div>
                              {document.description && (
                                <div className="mt-2 text-sm text-white/72">
                                  {document.description}
                                </div>
                              )}
                              {document.documentUrl && (
                                <a
                                  href={document.documentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 inline-flex text-xs font-semibold text-[#8CEBFF] hover:text-white"
                                >
                                  Open document
                                </a>
                              )}
                            </div>
                            <div className="text-sm font-semibold text-white">
                              {document.amount == null
                                ? "No amount"
                                : money(document.amount, document.currency)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="teal-glow-card p-5">
                  <div className="text-lg font-semibold text-white">
                    Notifications
                  </div>

                  <div className="mt-4 space-y-3">
                    {detail.notifications.length === 0 ? (
                      <div className="info-banner">
                        No finance notifications yet.
                      </div>
                    ) : (
                      detail.notifications.map((note) => (
                        <div key={note.id} className="glass-panel p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">
                                {note.title}
                              </div>
                              <div className="mt-1 text-sm text-white/72">
                                {note.body}
                              </div>
                            </div>
                            <div className="text-right text-xs">
                              <div
                                className={[
                                  "inline-flex rounded-full border px-2.5 py-1 font-medium",
                                  severityBadgeClass(note.severity),
                                ].join(" ")}
                              >
                                {note.severity}
                              </div>
                              <div className="mt-2 text-white/50">
                                {when(note.createdAt)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="teal-glow-card p-5">
                <div className="text-lg font-semibold text-white">
                  Transactions
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-white/55">
                      <tr>
                        <th className="px-3 py-2 font-medium">Occurred</th>
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-white/72">
                            No transactions recorded yet.
                          </td>
                        </tr>
                      ) : (
                        detail.transactions.map((transaction) => (
                          <tr
                            key={transaction.id}
                            className="border-t border-[rgba(140,235,255,0.10)]"
                          >
                            <td className="px-3 py-3 text-white/72">
                              {when(transaction.occurredAt)}
                            </td>
                            <td className="px-3 py-3 text-white/88">
                              {transaction.description}
                            </td>
                            <td className="px-3 py-3 font-semibold text-white">
                              {money(transaction.amount, transaction.currency)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
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
