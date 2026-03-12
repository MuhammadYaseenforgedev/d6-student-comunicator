// src/pages/ThreadPage.tsx
// Conversation screen.
// Responsibilities:
// - Load thread metadata
// - Load current and older messages
// - Allow sending new messages
// - Preserve scroll position when loading older messages

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

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  /**
   * Resolve the other participant's email for the page title.
   */
  const otherEmail = useMemo(() => {
    if (!thread) return "Conversation";
    const other = thread.participants.find(
      (p) => p.email.trim().toLowerCase() !== myEmail
    );
    return other?.email ?? "Conversation";
  }, [thread, myEmail]);

  /**
   * Load the thread header and newest messages.
   */
  const loadInitial = useCallback(async () => {
    if (!threadId) return;

    setError(null);
    setLoading(true);
    try {
      const t = await threadsApi.getThread(threadId);
      setThread(t);

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

  /**
   * Load older messages using cursor pagination.
   * Keeps the user's scroll position stable after prepending messages.
   */
  const loadOlder = useCallback(async () => {
    if (!threadId || !nextBefore || loadingMore) return;

    setLoadingMore(true);
    setError(null);

    const container = scrollRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;

    try {
      const res = await threadsApi.listMessages(threadId, {
        limit: 20,
        before: nextBefore,
      });

      setMessages((curr) => [...res.value, ...curr]);
      setNextBefore(res.nextBefore);

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

  /**
   * Auto-load older messages when the scroll container reaches the top.
   */
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

  /**
   * Send a new message to the current thread.
   */
  async function send() {
    if (!threadId) return;

    setError(null);
    const text = body.trim();
    if (!text) return;

    setSending(true);
    try {
      const msg = await threadsApi.sendMessage(threadId, text);
      setMessages((curr) => [...curr, msg]);
      setBody("");

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

  /**
   * Check whether a message belongs to the current user.
   */
  function isMine(m: ThreadMessage) {
    return m.createdBy === myUserId;
  }

  if (!threadId) {
    return (
      <div className="text-black">
        Missing thread id.{" "}
        <button className="underline" onClick={() => navigate("/app/messages")}>
          Back
        </button>
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
            className="btn-secondary"
            title="Back to inbox"
            aria-label="Back to inbox"
          >
            Back to Inbox
          </button>
        }
      />

      {error && <div className="error-banner mt-4">{error}</div>}

      <div className="glass-panel mt-6">
        {/* Message list */}
        <div
          ref={scrollRef}
          className="h-[60vh] space-y-3 overflow-y-auto p-4"
        >
          {loading ? (
            <div className="text-black">Loading…</div>
          ) : (
            <>
              <div className="flex justify-center">
                {nextBefore ? (
                  <button
                    type="button"
                    onClick={() => void loadOlder()}
                    disabled={loadingMore}
                    className="btn-secondary text-xs disabled:opacity-60"
                    title="Load older messages"
                    aria-label="Load older messages"
                  >
                    {loadingMore ? "Loading older…" : "Load older"}
                  </button>
                ) : (
                  <div className="text-xs text-black">No older messages</div>
                )}
              </div>

              {messages.length === 0 ? (
                <div className="py-6 text-center text-sm text-black">
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
                        "max-w-[78%] rounded-3xl border px-4 py-3 text-sm transition-all duration-200",
                        isMine(m)
                          ? "border-[#4EC2F3]/35 bg-[#4EC2F3]/16 text-black"
                          : "border-[#DADDE2] bg-white text-black",
                      ].join(" ")}
                    >
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      <div className="mt-2 text-[11px] text-black">
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
        <div className="flex gap-2 border-t border-[#DADDE2] p-4">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message…"
            className="input-glass flex-1"
            aria-label="Message input"
            title="Message input"
            onKeyDown={(e) => {
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
            className="btn-primary px-5"
            title="Send message"
            aria-label="Send message"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}