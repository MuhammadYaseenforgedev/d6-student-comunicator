// src/pages/ThreadPage.tsx
// Conversation screen (messages in one thread).
// Contract:
// - GET /api/threads/:id
// - GET /api/threads/:id/messages
// - POST /api/threads/:id/messages { body }
// - Cursor pagination: GET .../messages?limit=20&before=<nextBefore>
//   prepend older messages to the top.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import { threadsApi, type Thread, type ThreadMessage } from "../lib/threadsApi";

export default function ThreadPage() {
  const navigate = useNavigate();
  const { id: threadId } = useParams();

  const user = getUser();
  const myUserId = user?.id ?? "";
  const myEmail = (user?.email ?? "").trim().toLowerCase();

  // Thread header info
  const [thread, setThread] = useState<Thread | null>(null);

  // Message list
  const [messages, setMessages] = useState<ThreadMessage[]>([]);

  // Cursor paging
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Scroll container ref (for "scroll up to load more")
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Derive the “other participant” for the page title
  const otherEmail = useMemo(() => {
    if (!thread) return "Conversation";
    const other = thread.participants.find((p) => p.email.trim().toLowerCase() !== myEmail);
    return other?.email ?? "Conversation";
  }, [thread, myEmail]);

  const loadInitial = useCallback(async () => {
    if (!threadId) return;

    setError(null);
    setLoading(true);
    try {
      // 1) Load thread header
      const t = await threadsApi.getThread(threadId);
      setThread(t);

      // 2) Load latest messages (no cursor)
      const res = await threadsApi.listMessages(threadId, { limit: 20 });
      setMessages(res.value);
      setNextBefore(res.nextBefore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load thread");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // Load older messages using cursor paging
  const loadOlder = useCallback(async () => {
    if (!threadId) return;
    if (!nextBefore) return; // no more pages
    if (loadingMore) return;

    setLoadingMore(true);
    setError(null);

    // Preserve scroll position when prepending messages
    const container = scrollRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;

    try {
      const res = await threadsApi.listMessages(threadId, { limit: 20, before: nextBefore });

      // Prepend older messages (res.value comes chronological per page)
      setMessages((curr) => [...res.value, ...curr]);
      setNextBefore(res.nextBefore);

      // Restore scroll position so the UI doesn't jump
      requestAnimationFrame(() => {
        if (!container) return;
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load older messages");
    } finally {
      setLoadingMore(false);
    }
  }, [threadId, nextBefore, loadingMore]);

  // Scroll handler: when user hits top, load older
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      if (el.scrollTop <= 0) {
        void loadOlder();
      }
    };

    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [loadOlder]);

  async function send() {
    if (!threadId) return;

    setError(null);
    const text = body.trim();
    if (!text) return;

    setSending(true);
    try {
      const msg = await threadsApi.sendMessage(threadId, text);

      // Append new message to the end
      setMessages((curr) => [...curr, msg]);
      setBody("");

      // Scroll to bottom after sending
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  function isMine(m: ThreadMessage) {
    // Backend contract: createdBy is my userId
    return m.createdBy === myUserId;
  }

  if (!threadId) {
    return (
      <div className="text-slate-200">
        Missing thread id. <button className="underline" onClick={() => navigate("/app/messages")}>Back</button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={otherEmail}
        subtitle="Scroll up to load older messages. Type and send to post a new one."
        actions={
          <button
            type="button"
            onClick={() => navigate("/app/messages")}
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-900/50"
          >
            Back to Inbox
          </button>
        }
      />

      {error && (
        <div className="mt-4 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/30">
        {/* Messages */}
        <div
          ref={scrollRef}
          className="h-[60vh] overflow-y-auto p-4 space-y-3"
        >
          {loading ? (
            <div className="text-slate-400">Loading…</div>
          ) : (
            <>
              {/* Load older indicator */}
              <div className="flex justify-center">
                {nextBefore ? (
                  <button
                    type="button"
                    onClick={() => void loadOlder()}
                    disabled={loadingMore}
                    className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs hover:bg-slate-900/50 disabled:opacity-60"
                  >
                    {loadingMore ? "Loading older…" : "Load older"}
                  </button>
                ) : (
                  <div className="text-xs text-slate-500">No older messages</div>
                )}
              </div>

              {messages.length === 0 ? (
                <div className="text-slate-400 text-sm text-center py-6">
                  No messages yet. Send the first one.
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${isMine(m) ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={[
                        "max-w-[78%] rounded-2xl px-4 py-3 border text-sm",
                        isMine(m)
                          ? "bg-blue-600/20 border-blue-700 text-slate-100"
                          : "bg-slate-950/40 border-slate-800 text-slate-200",
                      ].join(" ")}
                    >
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      <div className="mt-2 text-[11px] text-slate-400">
                        {new Date(m.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-slate-800 p-4 flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 rounded-lg bg-slate-950 border border-slate-800 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
            onKeyDown={(e) => {
              // Enter sends (Shift+Enter can be added later if you want multi-line)
              if (e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
          />

          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            className="rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
