// src/pages/Inbox.tsx
// Inbox screen:
// - Lists conversation threads
// - Allows creating a new conversation
// - Parents are limited to messaging lecturers and admins
// - Uses shared neon glass styles for consistent layout

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import { threadsApi, type DirectoryUser, type Thread } from "../lib/threadsApi";
import { fetchTeamsLinks, type TeamsLink } from "../lib/teamsLinksApi";
import teamsLogo from "../assets/teams-logo.png";

function formatLastMessageDate(value?: string | null) {
  if (!value) return "No messages yet";
  return `Last message: ${new Date(value).toLocaleString()}`;
}

export default function Inbox() {
  const navigate = useNavigate();
  const user = getUser();

  const role = String(user?.role ?? "").toUpperCase();
  const isParent = role === "PARENT";
  const myEmail = (user?.email ?? "").trim().toLowerCase();
  const canUseTeamsWorkspace = !isParent;

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);

  const [recipients, setRecipients] = useState<DirectoryUser[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [teamsLinks, setTeamsLinks] = useState<TeamsLink[]>([]);

  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await threadsApi.listThreads({ limit: 50 });
      setThreads(Array.isArray(res.value) ? res.value : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load threads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const loadRecipients = useCallback(async () => {
    if (!isParent) return;

    setLoadingRecipients(true);
    setError(null);
    try {
      const res = await threadsApi.listUsers({
        roles: ["ADMIN", "LECTURER"],
        limit: 100,
      });

      const list = Array.isArray(res.value) ? res.value : [];
      const allowed = list.filter((u) => {
        const r = String(u.role ?? "").toUpperCase();
        const email = String(u.email ?? "").trim().toLowerCase();
        return (r === "ADMIN" || r === "LECTURER") && email !== myEmail;
      });

      setRecipients(allowed);
      setNewEmail((prev) => prev || (allowed[0]?.email ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recipients");
      setRecipients([]);
      setNewEmail("");
    } finally {
      setLoadingRecipients(false);
    }
  }, [isParent, myEmail]);

  useEffect(() => {
    void loadRecipients();
  }, [loadRecipients]);

  useEffect(() => {
    let cancelled = false;

    async function loadTeamsLinks() {
      try {
        const res = await fetchTeamsLinks();
        if (!cancelled) {
          setTeamsLinks(Array.isArray(res.value) ? res.value : []);
        }
      } catch {
        if (!cancelled) {
          setTeamsLinks([]);
        }
      }
    }

    void loadTeamsLinks();
    return () => {
      cancelled = true;
    };
  }, []);

  const threadTitle = useCallback(
    (t: Thread) => {
      const other = t.participants.find(
        (p) => p.email.trim().toLowerCase() !== myEmail
      );
      return other?.email ?? "Unknown";
    },
    [myEmail]
  );

  const subtitle = useMemo(
    () => "Your conversations (threads). Click one to open messages.",
    []
  );

  async function startNewConversation() {
    setError(null);

    const email = newEmail.trim().toLowerCase();
    if (!email) {
      setError(
        isParent
          ? "Select a recipient first."
          : "Enter a participant email first."
      );
      return;
    }

    if (isParent) {
      const allowed = recipients.some(
        (r) => r.email.trim().toLowerCase() === email
      );
      if (!allowed) {
        setError("Parents can only message lecturers or admins.");
        return;
      }
    }

    if (loadingRecipients) {
      setError("Loading recipients. Please try again.");
      return;
    }

    setBusy(true);
    try {
      const thread = await threadsApi.createThread(email);
      navigate(`/app/messages/${thread.id}`);
      await loadThreads();
      setNewEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create thread");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        subtitle={subtitle}
        actions={
          <button
            type="button"
            onClick={loadThreads}
            className="btn-secondary min-w-[120px]"
            title="Refresh conversations"
            aria-label="Refresh conversations"
          >
            Refresh
          </button>
        }
      />

      {error && <div className="error-banner">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <section className="teal-glow-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">New Message</h2>
                <p className="mt-1 text-sm text-white/72">
                  {isParent
                    ? "Start a new conversation with a lecturer or admin."
                    : "Start a new conversation by entering the other participant's email."}
                </p>
              </div>

              <div className="hidden items-center gap-2 rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.56)] px-3 py-2 text-xs text-white/70 sm:flex">
                <span className="status-dot" />
                Compose
              </div>
            </div>

            <div className="divider-soft my-5" />

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="inbox-participant-email"
                  className="block text-sm font-medium text-white/85"
                >
                  Participant email
                </label>

                {isParent ? (
                  <select
                    id="inbox-participant-email"
                    name="participantEmail"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    disabled={loadingRecipients || recipients.length === 0}
                    className="select-glass mt-2 disabled:opacity-60"
                    aria-label="Select participant email"
                    title="Select participant email"
                  >
                    {recipients.length === 0 ? (
                      <option value="">
                        {loadingRecipients
                          ? "Loading recipients..."
                          : "No lecturer/admin recipients found"}
                      </option>
                    ) : (
                      recipients.map((r) => (
                        <option key={r.id} value={r.email}>
                          {r.email} ({r.role})
                        </option>
                      ))
                    )}
                  </select>
                ) : (
                  <input
                    id="inbox-participant-email"
                    name="participantEmail"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="student1@forge.local"
                    className="input-glass mt-2"
                    aria-label="Participant email"
                    title="Participant email"
                  />
                )}
              </div>

              <button
                type="button"
                onClick={startNewConversation}
                disabled={
                  busy ||
                  (isParent && (loadingRecipients || recipients.length === 0))
                }
                className="btn-primary w-full"
                title="Start new conversation"
                aria-label="Start new conversation"
              >
                {busy ? "Creating..." : "Start Conversation"}
              </button>
            </div>
          </section>

          <section className="teal-glow-card p-5 transition-all duration-300 hover:-translate-y-[1px]">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center rounded-xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.6)] p-2 shadow-[0_0_12px_rgba(140,235,255,0.12)]">
                <img
                  src={teamsLogo}
                  alt="Microsoft Teams logo"
                  className="h-6 w-6 object-contain"
                />
              </div>

              <div>
                <h2 className="text-lg font-semibold text-white">
                  Microsoft Teams
                </h2>
                <p className="text-sm text-white/70">
                  Open your role-specific Teams workspace.
                </p>
              </div>
            </div>

            <div className="divider-soft my-4" />

            {canUseTeamsWorkspace ? (
              teamsLinks.length > 0 ? (
                <div className="space-y-3">
                  {teamsLinks.map((link) => (
                    <a
                      key={link.key}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block w-full rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.6)] px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:border-[rgba(140,235,255,0.4)] hover:bg-[rgba(14,42,99,0.65)] hover:shadow-[0_0_16px_rgba(140,235,255,0.15)] active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={teamsLogo}
                          alt=""
                          aria-hidden="true"
                          className="h-5 w-5 object-contain opacity-95 transition-transform duration-200 group-hover:scale-105"
                        />
                        <span>{link.label}</span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="info-banner border-[rgba(255,196,87,0.24)] bg-[rgba(97,59,9,0.45)] text-[#ffe8b0] shadow-none">
                  Teams links are not configured for your role yet. Add the
                  relevant{" "}
                  <code className="rounded bg-black/20 px-1.5 py-0.5 text-xs">
                    {`TEAMS_LINK_*`}
                  </code>{" "}
                  value in the backend environment to restore this shortcut.
                </div>
              )
            ) : (
              <div className="info-banner text-white/75">
                Teams workspace links are only available for student, lecturer,
                and admin accounts.
              </div>
            )}
          </section>
        </div>

        <section className="teal-glow-card p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Conversations
              </h2>
              <p className="mt-1 text-sm text-white/72">
                {loading ? "Loading conversations..." : `${threads.length} thread(s)`}
              </p>
            </div>

            <div className="rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.56)] px-3 py-2 text-xs text-white/70">
              Recent threads
            </div>
          </div>

          <div className="divider-soft my-5" />

          <div className="space-y-3">
            {loading ? (
              <div className="info-banner">Loading conversations...</div>
            ) : threads.length === 0 ? (
              <div className="info-banner">
                No conversations yet. Start a new conversation from the panel on
                the left.
              </div>
            ) : (
              threads.map((t) => {
                const title = threadTitle(t);

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => navigate(`/app/messages/${t.id}`)}
                    className="w-full rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4 text-left text-white transition-all duration-200 hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.34)] hover:bg-[rgba(14,42,99,0.62)] hover:shadow-[0_0_18px_rgba(140,235,255,0.12)]"
                    title={`Open conversation with ${title}`}
                    aria-label={`Open conversation with ${title}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white">
                          {title}
                        </div>
                        <div className="mt-1 text-xs text-white/70">
                          {formatLastMessageDate(t.lastMessageAt)}
                        </div>
                      </div>

                      <div className="shrink-0 rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.54)] px-3 py-1.5 text-[11px] text-white/65">
                        Open
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}