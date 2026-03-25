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

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString();
}

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

  const otherEmail = useMemo(() => {
    if (!thread) return "Conversation";
    const other = thread.participants.find(
      (p) => p.email.trim().toLowerCase() !== myEmail
    );
    return other?.email ?? "Conversation";
  }, [thread, myEmail]);

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
        container.scrollTop =
          prevScrollTop + (newScrollHeight - prevScrollHeight);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load older messages");
    } finally {
      setLoadingMore(false);
    }
  }, [threadId, nextBefore, loadingMore]);

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

  function isMine(m: ThreadMessage) {
    return m.createdBy === myUserId;
  }

  if (!threadId) {
    return (
      <div className="error-banner">
        Missing thread id.{" "}
        <button
          type="button"
          className="ml-2 underline underline-offset-4"
          onClick={() => navigate("/app/messages")}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={otherEmail}
        subtitle="Scroll up to load older messages. Type and send to post a new one."
        actions={
          <button
            type="button"
            onClick={() => navigate("/app/messages")}
            className="btn-secondary min-w-[140px]"
            title="Back to inbox"
            aria-label="Back to inbox"
          >
            Back to Inbox
          </button>
        }
      />

      {error && <div className="error-banner">{error}</div>}

      <section className="teal-glow-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-[rgba(140,235,255,0.12)] px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-white">Conversation</div>
            <div className="mt-1 text-xs text-white/65">
              {loading
                ? "Loading messages..."
                : `${messages.length} loaded message(s)`}
            </div>
          </div>

          <div className="rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.56)] px-3 py-2 text-xs text-white/70">
            Live thread
          </div>
        </div>

        <div
          ref={scrollRef}
          className="h-[60vh] space-y-4 overflow-y-auto px-4 py-4 sm:px-5"
        >
          {loading ? (
            <div className="info-banner">Loading messages...</div>
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
                    {loadingMore ? "Loading older..." : "Load older"}
                  </button>
                ) : (
                  <div className="text-xs text-white/60">No older messages</div>
                )}
              </div>

              {messages.length === 0 ? (
                <div className="info-banner text-center">
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
                        "max-w-[82%] rounded-3xl border px-4 py-3 text-sm transition-all duration-200 sm:max-w-[78%]",
                        isMine(m)
                          ? "border-[rgba(140,235,255,0.28)] bg-[rgba(79,166,255,0.16)] text-white shadow-[0_0_16px_rgba(140,235,255,0.10)]"
                          : "border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.72)] text-white",
                      ].join(" ")}
                    >
                      <div className="whitespace-pre-wrap break-words leading-6">
                        {m.body}
                      </div>
                      <div className="mt-2 text-[11px] text-white/60">
                        {formatMessageTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        <div className="border-t border-[rgba(140,235,255,0.14)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type a message..."
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
              className="btn-primary min-w-[130px] px-5"
              title="Send message"
              aria-label="Send message"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}