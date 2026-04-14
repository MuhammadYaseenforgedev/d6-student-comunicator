import { Link } from "react-router-dom";
import { useState } from "react";
import PageHeader from "../components/PageHeader";
import {
  listSupportTicketsByEmail,
  type SupportTicketIssueType,
  type SupportTicketPublic,
} from "../lib/supportApi";

const ISSUE_TYPES: Array<{ value: SupportTicketIssueType; label: string }> = [
  { value: "ACCOUNT_ACCESS", label: "Account access" },
  { value: "NETWORK", label: "Network issue" },
  { value: "POWER", label: "Power issue" },
  { value: "SOFTWARE", label: "Software issue" },
  { value: "DEVICE", label: "Device issue" },
  { value: "OTHER", label: "Other" },
];

const TROUBLESHOOTING_TIPS = [
  {
    title: "Network Issues",
    body: "Confirm your Wi-Fi is connected, restart the router if it is local, and retry the portal after reconnecting.",
  },
  {
    title: "Power Problems",
    body: "Check that the charger is seated correctly, switch to another power outlet, and allow the device a few minutes before retrying.",
  },
  {
    title: "Software Issues",
    body: "Sign out and back in, refresh the page, and update the browser before raising a ticket for a persistent error.",
  },
];

const PULSE_TICKET_SYSTEM_URL = "https://pulse.forgetalent.co.za/ticket.php";

function when(value: string): string {
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

function pulseSyncTone(status: SupportTicketPublic["pulseSyncStatus"]): string {
  if (status === "SYNCED") {
    return "border-[rgba(52,211,153,0.30)] bg-[rgba(52,211,153,0.14)] text-[#d9fff1]";
  }
  if (status === "FAILED") {
    return "border-[rgba(255,107,138,0.30)] bg-[rgba(255,107,138,0.14)] text-[#ffe2ea]";
  }
  if (status === "SKIPPED") {
    return "border-[rgba(161,161,170,0.28)] bg-[rgba(161,161,170,0.12)] text-[#f1f5f9]";
  }
  return "border-[rgba(79,166,255,0.30)] bg-[rgba(79,166,255,0.14)] text-[#d9eeff]";
}

function pulseSyncLabel(status: SupportTicketPublic["pulseSyncStatus"]): string {
  switch (status) {
    case "SYNCED":
      return "Pulse handoff sent";
    case "FAILED":
      return "Pulse handoff failed";
    case "SKIPPED":
      return "Pulse handoff skipped";
    default:
      return "Pulse handoff pending";
  }
}

export default function SupportDesk() {
  const [email, setEmail] = useState("");
  const [tickets, setTickets] = useState<SupportTicketPublic[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [hasLoadedTickets, setHasLoadedTickets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTickets(requesterEmail = email) {
    const normalized = requesterEmail.trim().toLowerCase();
    if (!normalized) return;

    try {
      setLoadingTickets(true);
      setHasLoadedTickets(true);
      const response = await listSupportTicketsByEmail(normalized);
      setTickets(Array.isArray(response.value) ? response.value : []);
    } catch (e) {
      setTickets([]);
      setError(e instanceof Error ? e.message : "Failed to load previous tickets");
    } finally {
      setLoadingTickets(false);
    }
  }

  async function onLookupSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email address is required.");
      return;
    }

    setError(null);
    await loadTickets(email);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="glass-panel-premium relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8CEBFF]/45 to-transparent" />
          <div className="absolute -left-12 top-0 h-40 w-40 rounded-full bg-[#8CEBFF]/10 blur-3xl" />
          <div className="absolute right-0 top-10 h-40 w-40 rounded-full bg-[#8C5BFF]/12 blur-3xl" />
        </div>

        <div className="relative space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <PageHeader
              title="Pulse Ticket Visibility"
              subtitle="Create new tickets in Pulse Ticket System and use Forge to review the read-only sync records currently tracked for your email."
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void loadTickets();
                }}
                disabled={loadingTickets || !email.trim()}
                className="btn-secondary"
              >
                {loadingTickets ? "Refreshing..." : "Refresh"}
              </button>
              <Link to="/login" className="btn-secondary">
                Back to login
              </Link>
            </div>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <div className="info-banner">
            This is an interim read-only view powered by Forge sync metadata. Live Pulse ticket reading and live Pulse ticket status are not configured in this environment yet.
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="teal-glow-card overflow-hidden p-0">
              <div className="bg-gradient-to-r from-[#4FA6FF] via-[#7C69FF] to-[#FF5EDB] px-6 py-4 text-lg font-semibold text-white">
                Pulse Ticket System
              </div>

              <div className="space-y-5 p-6">
                <div className="space-y-3 text-sm text-white/74">
                  <p>
                    New ticket creation stays in Pulse. Forge does not currently create or manage live Pulse tickets directly from this page.
                  </p>
                  <p>
                    Use the same email address in Pulse if you want Forge to match any tracked sync records to your account here.
                  </p>
                </div>

                <a
                  href={PULSE_TICKET_SYSTEM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary inline-flex w-full items-center justify-center"
                >
                  Open Pulse Ticket System
                </a>

                <div className="divider-soft" />

                <form onSubmit={onLookupSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="support-email" className="mb-2 block text-sm font-medium text-white/80">
                      Lookup Email Address
                    </label>
                    <input
                      id="support-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      placeholder="name@example.com"
                      className="input-glass w-full"
                    />
                  </div>

                  <button type="submit" disabled={loadingTickets} className="btn-secondary w-full">
                    {loadingTickets ? "Loading..." : "Load Read-only Sync List"}
                  </button>
                </form>

                <div className="rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.52)] px-4 py-4 text-sm text-white/68">
                  Tickets shown on this page come from Forge's local sync tracking only. A stable Pulse ticket id and direct Pulse read API are not available in this workspace yet.
                </div>
              </div>
            </section>

            <div className="space-y-6">
              <section className="teal-glow-card overflow-hidden p-0">
                <div className="bg-gradient-to-r from-[#4FA6FF] via-[#7C69FF] to-[#FF5EDB] px-6 py-4 text-lg font-semibold text-white">
                  Read-only Synced Ticket List
                </div>

                <div className="space-y-3 p-6">
                  {loadingTickets ? (
                    <div className="info-banner">Loading synced ticket records...</div>
                  ) : !hasLoadedTickets ? (
                    <div className="glass-panel p-6 text-sm text-white/70">
                      Enter an email address and load the read-only sync list to see any Forge-tracked Pulse records.
                    </div>
                  ) : tickets.length === 0 ? (
                    <div className="glass-panel p-6 text-sm text-white/70">
                      No Forge-tracked Pulse sync records were found for this email yet.
                    </div>
                  ) : (
                    tickets.map((ticket) => (
                      <div key={ticket.id} className="glass-panel p-4">
                        <div className="space-y-4">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {ISSUE_TYPES.find((option) => option.value === ticket.issueType)?.label ?? ticket.issueType}
                            </div>
                            <div className="mt-1 text-xs text-white/55">
                              Submitted {when(ticket.createdAt)}
                            </div>
                            {ticket.deviceNumber && (
                              <div className="mt-2 text-xs text-white/65">
                                Device: {ticket.deviceNumber}
                              </div>
                            )}
                            {ticket.pulseSyncedAt && (
                              <div className="mt-2 text-xs text-white/65">
                                Pulse handoff recorded {when(ticket.pulseSyncedAt)}
                              </div>
                            )}
                            {ticket.externalReference ? (
                              <div className="mt-2 text-xs text-white/65">
                                Pulse reference: {ticket.externalReference}
                              </div>
                            ) : (
                              <div className="mt-2 text-xs text-white/50">
                                Pulse reference is not available in this environment yet.
                              </div>
                            )}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                                Forge status
                              </div>
                              <span
                                className={[
                                  "inline-flex min-h-8 min-w-[110px] shrink-0 self-start items-center justify-center rounded-full border px-3 py-1 text-center text-[11px] font-semibold leading-none whitespace-nowrap sm:self-auto",
                                  statusTone(ticket.status),
                                ].join(" ")}
                              >
                                {ticket.status.replace(/_/g, " ")}
                              </span>
                            </div>

                            <div className="space-y-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                                Pulse sync
                              </div>
                              <span
                                className={[
                                  "inline-flex min-h-8 min-w-[150px] shrink-0 self-start items-center justify-center rounded-full border px-3 py-1 text-center text-[11px] font-semibold leading-none whitespace-nowrap sm:self-auto",
                                  pulseSyncTone(ticket.pulseSyncStatus),
                                ].join(" ")}
                              >
                                {pulseSyncLabel(ticket.pulseSyncStatus)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="teal-glow-card overflow-hidden p-0">
                <div className="bg-gradient-to-r from-[#4FA6FF] via-[#7C69FF] to-[#FF5EDB] px-6 py-4 text-lg font-semibold text-white">
                  Direct Support Contact
                </div>

                <div className="space-y-3 p-6 text-white/80">
                  <p>For urgent matters, you can contact the IT support desk directly:</p>
                  <div className="text-base font-semibold text-white">+27 10 880 3795</div>
                  <div className="text-base font-semibold text-white">support@forgeacademy.co.za</div>
                  <div className="pt-4 text-sm text-white/55">
                    Support is typically available Monday to Friday, 8am to 5pm.
                  </div>
                </div>
              </section>
            </div>
          </div>

          <section className="teal-glow-card overflow-hidden p-0">
            <div className="bg-gradient-to-r from-[#4FA6FF] via-[#7C69FF] to-[#FF5EDB] px-6 py-4 text-lg font-semibold text-white">
              Quick Troubleshooting Tips
            </div>

            <div className="space-y-3 p-6">
              {TROUBLESHOOTING_TIPS.map((tip) => (
                <details
                  key={tip.title}
                  className="rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.54)]"
                >
                  <summary className="cursor-pointer list-none px-5 py-4 text-base font-medium text-white">
                    {tip.title}
                  </summary>
                  <div className="border-t border-[rgba(140,235,255,0.10)] px-5 py-4 text-sm text-white/72">
                    {tip.body}
                  </div>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
