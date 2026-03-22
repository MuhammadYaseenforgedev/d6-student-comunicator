import { Link } from "react-router-dom";
import { useState } from "react";
import PageHeader from "../components/PageHeader";
import {
  listSupportTicketsByEmail,
  submitSupportTicket,
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

export default function SupportDesk() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [deviceNumber, setDeviceNumber] = useState("");
  const [issueType, setIssueType] = useState<SupportTicketIssueType>("ACCOUNT_ACCESS");
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<SupportTicketPublic[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function loadTickets(requesterEmail = email) {
    const normalized = requesterEmail.trim().toLowerCase();
    if (!normalized) return;

    try {
      setLoadingTickets(true);
      const response = await listSupportTicketsByEmail(normalized);
      setTickets(Array.isArray(response.value) ? response.value : []);
    } catch (e) {
      setTickets([]);
      setError(e instanceof Error ? e.message : "Failed to load previous tickets");
    } finally {
      setLoadingTickets(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email address is required.");
      return;
    }
    if (!message.trim() || message.trim().length < 10) {
      setError("Describe the issue in at least 10 characters.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);

      await submitSupportTicket({
        email: email.trim().toLowerCase(),
        name: name.trim() || undefined,
        deviceNumber: deviceNumber.trim() || undefined,
        issueType,
        message: message.trim(),
      });

      setMessage("");
      setInfo("Support request submitted. The team will contact you by email.");
      await loadTickets(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit ticket");
    } finally {
      setBusy(false);
    }
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
              title="IT Support & Assistance"
              subtitle="Submit a support request and track previous issues linked to your email address."
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
          {info && <div className="info-banner">{info}</div>}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="teal-glow-card overflow-hidden p-0">
              <div className="bg-gradient-to-r from-[#4FA6FF] via-[#7C69FF] to-[#FF5EDB] px-6 py-4 text-lg font-semibold text-white">
                Submit New Request
              </div>

              <form onSubmit={onSubmit} className="space-y-4 p-6">
                <div>
                  <label htmlFor="support-email" className="mb-2 block text-sm font-medium text-white/80">
                    Your Email Address
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="support-name" className="mb-2 block text-sm font-medium text-white/80">
                      Name
                    </label>
                    <input
                      id="support-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="input-glass w-full"
                    />
                  </div>

                  <div>
                    <label htmlFor="support-device" className="mb-2 block text-sm font-medium text-white/80">
                      Laptop / Device Number
                    </label>
                    <input
                      id="support-device"
                      value={deviceNumber}
                      onChange={(e) => setDeviceNumber(e.target.value)}
                      placeholder="Optional device number"
                      className="input-glass w-full"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="support-issue-type" className="mb-2 block text-sm font-medium text-white/80">
                    Type of Issue
                  </label>
                  <select
                    id="support-issue-type"
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as SupportTicketIssueType)}
                    className="select-glass w-full"
                  >
                    {ISSUE_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="support-message" className="mb-2 block text-sm font-medium text-white/80">
                    Describe Your Issue
                  </label>
                  <textarea
                    id="support-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={7}
                    placeholder="Please provide detailed information about your issue."
                    className="input-glass w-full resize-none"
                  />
                </div>

                <button type="submit" disabled={busy} className="btn-primary">
                  {busy ? "Submitting..." : "Submit request"}
                </button>

                <div className="text-sm text-white/65">
                  Our support team will review your request and contact you via email.
                </div>
              </form>
            </section>

            <div className="space-y-6">
              <section className="teal-glow-card overflow-hidden p-0">
                <div className="bg-gradient-to-r from-[#4FA6FF] via-[#7C69FF] to-[#FF5EDB] px-6 py-4 text-lg font-semibold text-white">
                  Your Previous Requests
                </div>

                <div className="space-y-3 p-6">
                  {loadingTickets ? (
                    <div className="info-banner">Loading support history...</div>
                  ) : tickets.length === 0 ? (
                    <div className="glass-panel p-6 text-sm text-white/70">
                      You haven't submitted any assistance requests yet.
                    </div>
                  ) : (
                    tickets.map((ticket) => (
                      <div key={ticket.id} className="glass-panel p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
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
                          </div>
                          <span
                            className={[
                              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                              statusTone(ticket.status),
                            ].join(" ")}
                          >
                            {ticket.status.replace(/_/g, " ")}
                          </span>
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
