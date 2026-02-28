// src/pages/Inbox.tsx
// Inbox screen: lists threads + starts a new conversation.
// Contract:
// - GET /api/threads
// - Thread title = other participant email
// - Click navigates to /app/messages/:threadId

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

  // Your identity for "other participant" logic
  const myEmail = (user?.email ?? "").trim().toLowerCase();

  // Data state
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);
  const [recipients, setRecipients] = useState<DirectoryUser[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // New thread UI state
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  // Error UI state
  const [error, setError] = useState<string | null>(null);

  // Pull threads from backend
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
      const res = await threadsApi.listUsers({ roles: ["ADMIN", "LECTURER"], limit: 100 });
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

  // Helper: get the "other participant" email
  const threadTitle = useCallback(
    (t: Thread) => {
      const other = t.participants.find((p) => p.email.trim().toLowerCase() !== myEmail);
      return other?.email ?? "Unknown";
    },
    [myEmail]
  );

  const subtitle = useMemo(() => {
    return "Your conversations (threads). Click one to open messages.";
  }, []);

  async function startNewConversation() {
    setError(null);

    const email = newEmail.trim().toLowerCase();
    if (!email) {
      setError(isParent ? "Select a recipient first." : "Enter a participant email first.");
      return;
    }

    if (isParent) {
      const allowed = recipients.some((r) => r.email.trim().toLowerCase() === email);
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

      // Navigate to the created or reused thread
      navigate(`/app/messages/${thread.id}`);

      // Optional: refresh list so it looks correct when user comes back
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
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-900/50"
          >
            Refresh
          </button>
        }
      />

      {error && (
        <div className="mt-4 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
        {/* New message */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <div className="text-lg font-semibold text-white">New Message</div>
          <div className="mt-1 text-sm text-slate-400">
            {isParent
              ? "Start a new conversation with a lecturer or admin."
              : "Start a new conversation by entering the other participant's email."}
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm text-slate-300">Participant email</label>
              {isParent ? (
                <select
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={loadingRecipients || recipients.length === 0}
                  className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                >
                  {recipients.length === 0 ? (
                    <option value="">
                      {loadingRecipients ? "Loading recipients..." : "No lecturer/admin recipients found"}
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
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="student1@forge.local"
                  className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
                />
              )}
            </div>

            <button
              type="button"
              onClick={startNewConversation}
              disabled={busy || (isParent && (loadingRecipients || recipients.length === 0))}
              className="w-full rounded-lg bg-blue-600 py-3 font-semibold hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? "Creating..." : "Start"}
            </button>
          </div>
        </div>

        {/* Thread list */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
          <div className="text-lg font-semibold text-white">Conversations</div>
          <div className="mt-1 text-sm text-slate-400">{loading ? "Loading..." : `${threads.length} thread(s)`}</div>

          <div className="mt-4 space-y-2">
            {loading ? (
              <div className="text-slate-400">Loading...</div>
            ) : threads.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-6 text-slate-300">
                No conversations yet.
              </div>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigate(`/app/messages/${t.id}`)}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left transition hover:bg-slate-900/40"
                >
                  <div className="font-semibold text-white">{threadTitle(t)}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {t.lastMessageAt ? `Last message: ${new Date(t.lastMessageAt).toLocaleString()}` : "No messages yet"}
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
