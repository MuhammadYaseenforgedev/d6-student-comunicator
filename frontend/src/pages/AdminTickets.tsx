import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import {
  listAdminSupportTickets,
  updateAdminSupportTicket,
  type SupportTicketAdmin,
  type SupportTicketStatus,
} from "../lib/supportApi";

const TICKET_STATUSES: Array<SupportTicketStatus | "ALL"> = [
  "ALL",
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

function when(value: string | null | undefined): string {
  if (!value) return "N/A";
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toLocaleString() : value;
}

function statusTone(status: string): string {
  if (status === "RESOLVED" || status === "CLOSED") {
    return "border-[rgba(52,211,153,0.30)] bg-[rgba(52,211,153,0.14)] text-[#d9fff1]";
  }
  if (status === "IN_PROGRESS") {
    return "border-[rgba(79,166,255,0.30)] bg-[rgba(79,166,255,0.14)] text-[#d9eeff]";
  }
  return "border-[rgba(255,196,87,0.30)] bg-[rgba(255,196,87,0.14)] text-[#ffecc2]";
}

export default function AdminTickets() {
  const [tickets, setTickets] = useState<SupportTicketAdmin[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState("");
  const [statusInput, setStatusInput] = useState<SupportTicketStatus>("OPEN");
  const [adminNote, setAdminNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedId) ?? null;

  async function loadTickets(preferredId?: string) {
    try {
      setLoading(true);
      setError(null);
      const response = await listAdminSupportTickets({
        q: search || undefined,
        status: statusFilter,
      });
      const rows = Array.isArray(response.value) ? response.value : [];
      setTickets(rows);
      const nextId = preferredId || selectedId;
      const resolvedId = rows.some((ticket) => ticket.id === nextId)
        ? nextId
        : rows[0]?.id ?? "";
      setSelectedId(resolvedId);
      const nextTicket = rows.find((ticket) => ticket.id === resolvedId);
      setStatusInput(nextTicket?.status ?? "OPEN");
      setAdminNote(nextTicket?.adminNote ?? "");
    } catch (e) {
      setTickets([]);
      setSelectedId("");
      setError(e instanceof Error ? e.message : "Failed to load support tickets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  useEffect(() => {
    if (!selectedTicket) return;
    setStatusInput(selectedTicket.status);
    setAdminNote(selectedTicket.adminNote ?? "");
  }, [selectedTicket]);

  async function saveTicket() {
    if (!selectedTicket) return;
    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await updateAdminSupportTicket(selectedTicket.id, {
        status: statusInput,
        adminNote: adminNote.trim() || null,
      });
      setInfo("Support ticket updated.");
      await loadTickets(selectedTicket.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update support ticket");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        subtitle="Review incoming support requests and track their resolution."
        actions={
          <button
            type="button"
            onClick={() => {
              void loadTickets();
            }}
            disabled={loading}
            className="btn-secondary min-w-[120px]"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      {error && <div className="error-banner">{error}</div>}
      {info && <div className="info-banner">{info}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        <section className="teal-glow-card p-5">
          <form
            className="grid grid-cols-1 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search email, issue, device, or message"
              className="input-glass w-full"
            />
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div>
                <label
                  htmlFor="ticket-status-filter"
                  className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/55"
                >
                  Status filter
                </label>
                <select
                  id="ticket-status-filter"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as SupportTicketStatus | "ALL")
                  }
                  className="select-glass w-full"
                >
                  {TICKET_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status === "ALL" ? "All statuses" : status.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-primary min-w-[100px]">
                Search
              </button>
            </div>
          </form>

          <div className="divider-soft my-5" />

          <div className="space-y-3">
            {loading ? (
              <div className="info-banner">Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="info-banner">No support tickets matched the current filters.</div>
            ) : (
              tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={[
                    "w-full rounded-3xl border p-4 text-left transition-all duration-200",
                    ticket.id === selectedId
                      ? "border-[rgba(140,235,255,0.30)] bg-[rgba(14,42,99,0.28)]"
                      : "border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.50)] hover:border-[rgba(140,235,255,0.24)]",
                  ].join(" ")}
                >
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {ticket.requesterEmail}
                      </div>
                      <div className="mt-1 text-xs text-white/55">
                        {ticket.issueType.replace(/_/g, " ")}
                      </div>
                      <div className="mt-2 text-xs text-white/45">
                        {when(ticket.createdAt)}
                      </div>
                    </div>
                    <div className="flex justify-start">
                    <span
                      className={[
                        "inline-flex min-h-8 min-w-[110px] shrink-0 self-start items-center justify-center rounded-full border px-3 py-1 text-center text-[11px] font-semibold leading-none whitespace-nowrap sm:self-auto",
                        statusTone(ticket.status),
                      ].join(" ")}
                    >
                      {ticket.status.replace(/_/g, " ")}
                    </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="teal-glow-card p-5">
          {!selectedTicket ? (
            <div className="info-banner">Select a support ticket to review it.</div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">
                    {selectedTicket.requesterName?.trim() || selectedTicket.requesterEmail}
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    {selectedTicket.requesterEmail}
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    {selectedTicket.issueType.replace(/_/g, " ")}
                    {selectedTicket.deviceNumber ? ` • ${selectedTicket.deviceNumber}` : ""}
                  </div>
                </div>

                <div className="rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.56)] px-4 py-3 text-sm text-white/75">
                  Created {when(selectedTicket.createdAt)}
                </div>
              </div>

              <div className="glass-panel p-4">
                <div className="text-xs uppercase tracking-wide text-white/55">
                  Request
                </div>
                <div className="mt-3 whitespace-pre-wrap text-sm text-white/82">
                  {selectedTicket.message}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  <label
                    htmlFor="ticket-status-input"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/55"
                  >
                    Status
                  </label>
                  <select
                    id="ticket-status-input"
                    value={statusInput}
                    onChange={(e) => setStatusInput(e.target.value as SupportTicketStatus)}
                    className="select-glass w-full"
                  >
                    {TICKET_STATUSES.filter((status) => status !== "ALL").map((status) => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/55">
                    Internal note
                  </label>
                  <textarea
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    rows={5}
                    placeholder="Internal note for the support team"
                    className="input-glass w-full resize-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void saveTicket();
                  }}
                  disabled={busy}
                  className="btn-primary"
                >
                  {busy ? "Saving..." : "Save ticket"}
                </button>

                <div className="text-sm text-white/60">
                  Assigned to {selectedTicket.assignedEmail ?? "the support queue"}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
