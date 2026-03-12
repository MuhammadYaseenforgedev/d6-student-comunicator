// src/pages/Inbox.tsx
// Inbox screen:
// - Lists conversation threads
// - Allows creating a new conversation
// - Parents are limited to messaging lecturers and admins
// - Uses shared button and panel classes for consistent hover effects

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import { threadsApi, type DirectoryUser, type Thread } from "../lib/threadsApi";

export default function Inbox() {
  const navigate = useNavigate();
  const user = getUser();

  const role = String(user?.role ?? "").toUpperCase();
  const isParent = role === "PARENT";
  const myEmail = (user?.email ?? "").trim().toLowerCase();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);

  const [recipients, setRecipients] = useState<DirectoryUser[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  /**
   * Load the current user's threads.
   */
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

  /**
   * For parents, load only lecturers and admins as valid recipients.
   */
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

  /**
   * Display the other participant email as the thread title.
   */
  const threadTitle = useCallback(
    (t: Thread) => {
      const other = t.participants.find(
        (p) => p.email.trim().toLowerCase() !== myEmail
      );
      return other?.email ?? "Unknown";
    },
    [myEmail]
  );

  const subtitle = useMemo(() => {
    return "Your conversations (threads). Click one to open messages.";
  }, []);

  /**
   * Create a new thread and navigate to it.
   */
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
    <div>
      <PageHeader
        title="Messages"
        subtitle={subtitle}
        actions={
          <button
            type="button"
            onClick={loadThreads}
            className="btn-secondary"
            title="Refresh conversations"
            aria-label="Refresh conversations"
          >
            Refresh
          </button>
        }
      />

      {error && <div className="error-banner mt-4">{error}</div>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
        {/* New conversation panel */}
        <div className="glass-panel p-5">
          <div className="text-lg font-semibold text-black">New Message</div>
          <div className="mt-1 text-sm text-black">
            {isParent
              ? "Start a new conversation with a lecturer or admin."
              : "Start a new conversation by entering the other participant's email."}
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="inbox-participant-email"
                className="block text-sm text-black"
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
                busy || (isParent && (loadingRecipients || recipients.length === 0))
              }
              className="btn-primary w-full"
              title="Start new conversation"
              aria-label="Start new conversation"
            >
              {busy ? "Creating..." : "Start"}
            </button>
          </div>
        </div>

        {/* Thread list panel */}
        <div className="glass-panel p-5">
          <div className="text-lg font-semibold text-black">Conversations</div>
          <div className="mt-1 text-sm text-black">
            {loading ? "Loading..." : `${threads.length} thread(s)`}
          </div>

          <div className="mt-4 space-y-2">
            {loading ? (
              <div className="text-black">Loading...</div>
            ) : threads.length === 0 ? (
              <div className="rounded-3xl border border-[#DADDE2] bg-white p-6 text-black">
                No conversations yet.
              </div>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigate(`/app/messages/${t.id}`)}
                  className="w-full rounded-3xl border border-[#DADDE2] bg-white p-4 text-left transition-all duration-200 hover:-translate-y-[1px] hover:border-[#4EC2F3]/50 hover:bg-[#4EC2F3]/08 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                  title={`Open conversation with ${threadTitle(t)}`}
                  aria-label={`Open conversation with ${threadTitle(t)}`}
                >
                  <div className="font-semibold text-black">
                    {threadTitle(t)}
                  </div>
                  <div className="mt-1 text-xs text-black">
                    {t.lastMessageAt
                      ? `Last message: ${new Date(
                          t.lastMessageAt
                        ).toLocaleString()}`
                      : "No messages yet"}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}