import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
} from "framer-motion";
import {
  ChevronRight,
  CornerDownRight,
  Eye,
  EyeOff,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import ChatbotAvatar, { type ChatbotAvatarMode } from "./ChatbotAvatar";

export type AssistantAction = {
  id: string;
  label: string;
  run: () => void | string | Promise<void | string>;
};

export type AssistantReply = {
  text: string;
  actions?: AssistantAction[];
};

export type AssistantChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type AssistantMessage = AssistantChatMessage & {
  actions?: AssistantAction[];
};

type AssistantWidgetProps = {
  name: string;
  subtitle: string;
  placeholder: string;
  welcome: AssistantReply;
  resetKey: string;
  contextTitle: string;
  contextSummary: string;
  spotlightActions?: AssistantAction[];
  onAsk: (
    input: string,
    history: Array<Pick<AssistantChatMessage, "role" | "text">>
  ) => AssistantReply | Promise<AssistantReply>;
};

function makeMessage(
  role: AssistantMessage["role"],
  text: string,
  actions?: AssistantAction[]
): AssistantMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    actions,
  };
}

function SpeechBubble({
  title,
  body,
  footer,
  compact = false,
}: {
  title?: string;
  body: string;
  footer?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "relative max-w-full rounded-[1.55rem] border border-[#8CEBFF]/16 bg-[linear-gradient(180deg,rgba(12,26,58,0.96),rgba(7,18,40,0.92))] text-left shadow-[0_14px_34px_rgba(2,8,24,0.32)]",
        compact ? "px-4 py-3" : "px-4 py-3.5",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute bottom-5 left-0">
        <div className="absolute left-0 top-1/2 h-[1.5px] w-3 -translate-x-[82%] -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,rgba(140,235,255,0.34),rgba(140,235,255,0.08))]" />
        <div className="absolute left-0 top-1/2 h-4.5 w-4.5 -translate-x-[58%] -translate-y-1/2 rounded-full border border-[#8CEBFF]/18 bg-[linear-gradient(180deg,rgba(11,24,54,0.98),rgba(7,18,40,0.96))] shadow-[0_0_14px_rgba(56,189,248,0.12)]">
          <div className="absolute inset-[4px] rounded-full bg-[radial-gradient(circle,rgba(140,235,255,0.38),transparent_72%)]" />
        </div>
      </div>
      {title && (
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#A6F0FF]">
          <Sparkles className="h-3.5 w-3.5" />
          {title}
        </div>
      )}
      <p
        className={
          title
            ? "mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-white/82"
            : "whitespace-pre-wrap break-words text-sm leading-6 text-white/82"
        }
      >
        {body}
      </p>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </div>
  );
}

export default function AssistantWidget({
  name,
  subtitle,
  placeholder,
  welcome,
  resetKey,
  contextSummary,
  onAsk,
}: AssistantWidgetProps) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [avatarMode, setAvatarMode] = useState<ChatbotAvatarMode>("idle");
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [
    makeMessage("assistant", welcome.text, welcome.actions),
  ]);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const dragBoundsRef = useRef<HTMLDivElement | null>(null);
  const speakingTimerRef = useRef<number | null>(null);
  const focusFrameRef = useRef<number | null>(null);
  const restoreOpenRef = useRef(false);
  const dragControls = useDragControls();
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const assistantBrand = "Sparky";

  function clearSpeakingTimer() {
    if (speakingTimerRef.current !== null) {
      window.clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }
  }

  function activateSpeakingMode() {
    clearSpeakingTimer();
    setAvatarMode("speaking");
    speakingTimerRef.current = window.setTimeout(() => {
      setAvatarMode("idle");
      speakingTimerRef.current = null;
    }, 1800);
  }

  useEffect(() => {
    setMessages([makeMessage("assistant", welcome.text, welcome.actions)]);
    setDraft("");
    clearSpeakingTimer();
    setAvatarMode("idle");
  }, [resetKey, welcome.actions, welcome.text]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  useEffect(() => {
    if (!open || hidden) return;

    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
    }

    focusFrameRef.current = window.requestAnimationFrame(() => {
      focusFrameRef.current = window.requestAnimationFrame(() => {
        const composer = composerRef.current;
        if (!composer) return;

        composer.focus({ preventScroll: true });

        const caretPosition = composer.value.length;
        composer.setSelectionRange(caretPosition, caretPosition);
        focusFrameRef.current = null;
      });
    });

    return () => {
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current);
        focusFrameRef.current = null;
      }
    };
  }, [hidden, open]);

  useEffect(() => {
    return () => {
      clearSpeakingTimer();
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current);
      }
    };
  }, []);

  function startDragging(event: React.PointerEvent<HTMLElement>) {
    dragControls.start(event);
  }

  function handlePanelPointerDown(event: React.PointerEvent<HTMLElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    if (target.closest("button, textarea, input, select, a, [data-no-drag]")) {
      return;
    }

    startDragging(event);
  }

  function handleDock() {
    dragX.set(0);
    dragY.set(0);
  }

  function handleHide() {
    restoreOpenRef.current = open;
    setHidden(true);
    setOpen(false);
  }

  function handleOpenAssistant() {
    restoreOpenRef.current = true;
    setHidden(false);
    setOpen(true);
  }

  function handleShow() {
    setHidden(false);
    setOpen(true);
    restoreOpenRef.current = true;
  }

  async function runAction(action: AssistantAction) {
    setBusy(true);
    setAvatarMode("thinking");
    let producedReply = false;

    try {
      const response = await action.run();
      if (typeof response === "string" && response.trim()) {
        setMessages((prev) => [
          ...prev,
          makeMessage("assistant", response.trim()),
        ]);
        producedReply = true;
        activateSpeakingMode();
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "I hit a snag while trying that action.";

      setMessages((prev) => [...prev, makeMessage("assistant", message)]);
      producedReply = true;
      activateSpeakingMode();
    } finally {
      setBusy(false);
      if (!producedReply) {
        setAvatarMode("idle");
      }
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = draft.trim();
    if (!input || busy) return;

    const userMessage = makeMessage("user", input);
    const history = messages.map(({ role, text }) => ({
      role,
      text,
    }));

    clearSpeakingTimer();
    setAvatarMode("thinking");
    setDraft("");
    setMessages((prev) => [...prev, userMessage]);
    setBusy(true);

    try {
      const reply = await onAsk(input, history);
      setMessages((prev) => [
        ...prev,
        makeMessage("assistant", reply.text, reply.actions),
      ]);
      activateSpeakingMode();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "I could not answer that right now.";

      setMessages((prev) => [...prev, makeMessage("assistant", message)]);
      activateSpeakingMode();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={dragBoundsRef}
      className="pointer-events-none fixed inset-0 z-40"
    >
      <motion.div
        drag
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={dragBoundsRef}
        dragMomentum={false}
        dragElastic={0.08}
        style={{ x: dragX, y: dragY }}
        className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6"
      >
      <AnimatePresence initial={false}>
        {hidden ? (
          <motion.div
            key="assistant-hidden"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.96 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="pointer-events-auto"
          >
            <div
              onPointerDown={handlePanelPointerDown}
              className="teal-glow-card relative flex cursor-grab items-center gap-2 rounded-[1.4rem] px-2.5 py-2 active:cursor-grabbing"
            >
              <ChatbotAvatar
                mode={avatarMode}
                size={42}
                className="shrink-0"
              />

              <button
                type="button"
                onClick={handleShow}
                className="flex min-w-0 items-center gap-2 rounded-[1.1rem] px-1.5 py-1 text-left text-white transition hover:bg-white/5"
                aria-label="Show assistant"
              >
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9EEFFF]">
                    {assistantBrand}
                  </div>
                  <div className="text-sm font-medium text-white/88">
                    Show assistant
                  </div>
                </div>
                <Eye className="h-4 w-4 shrink-0 text-[#B6F7FF]" />
              </button>
            </div>
          </motion.div>
        ) : open ? (
          <motion.section
            key="assistant-panel"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: {
                duration: 0.42,
                ease: [0.22, 1, 0.36, 1],
              },
            }}
            exit={{
              opacity: 0,
              y: 18,
              scale: 0.97,
              transition: { duration: 0.24, ease: "easeOut" },
            }}
            onPointerDown={handlePanelPointerDown}
            aria-label={`${assistantBrand} assistant. ${contextSummary}`}
            className="teal-glow-card pointer-events-auto relative flex h-[min(80vh,46rem)] w-[min(92vw,26rem)] cursor-grab flex-col overflow-hidden rounded-[2rem] active:cursor-grabbing"
          >
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top,rgba(140,235,255,0.14),transparent_60%)]" />
              <div className="absolute -left-10 top-6 h-28 w-28 rounded-full bg-[#8CEBFF]/16 blur-3xl" />
              <div className="absolute right-0 top-10 h-32 w-32 rounded-full bg-[#8C5BFF]/18 blur-3xl" />
              <div className="absolute bottom-16 left-8 h-20 w-20 rounded-full bg-[#38BDF8]/10 blur-3xl" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_24%,transparent_74%,rgba(255,255,255,0.02))]" />
            </div>

            <div className="relative overflow-hidden border-b border-[#8CEBFF]/10 px-4 py-3.5">
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <ChatbotAvatar
                    mode={avatarMode}
                    size={44}
                    className="shrink-0"
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-[#9EEFFF]">
                      {assistantBrand}
                    </div>
                    <div className="mt-1 truncate text-base font-semibold text-white">
                      {name}
                    </div>
                    <p className="mt-1 truncate text-xs text-white/62">
                      {subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDock}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#8CEBFF]/18 bg-white/5 text-white/72 transition hover:border-[#8CEBFF]/34 hover:bg-white/10 hover:text-white"
                    aria-label="Dock assistant to the corner"
                    title="Dock assistant to the corner"
                  >
                    <CornerDownRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleHide}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#8CEBFF]/18 bg-white/5 text-white/72 transition hover:border-[#8CEBFF]/34 hover:bg-white/10 hover:text-white"
                    aria-label="Hide assistant"
                    title="Hide assistant"
                  >
                    <EyeOff className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#8CEBFF]/18 bg-white/5 text-white/72 transition hover:border-[#8CEBFF]/34 hover:bg-white/10 hover:text-white"
                    aria-label="Close assistant"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="relative flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-3.5">
                <AnimatePresence initial={false}>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      layout
                      initial={{
                        opacity: 0,
                        x: message.role === "assistant" ? -20 : 20,
                        y: 14,
                      }}
                      animate={{ opacity: 1, x: 0, y: 0 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                      className={
                        message.role === "assistant"
                          ? "grid grid-cols-[auto,minmax(0,1fr)] items-start gap-3.5 pr-1"
                          : "flex justify-end pl-12 sm:pl-16"
                      }
                    >
                      {message.role === "assistant" && (
                        <ChatbotAvatar
                          mode={avatarMode}
                          size={48}
                          className="mt-1 shrink-0"
                        />
                      )}

                      <div
                        className={
                          message.role === "assistant"
                            ? "min-w-0 max-w-[19rem] sm:max-w-[20.5rem]"
                            : "max-w-[88%] sm:max-w-[82%]"
                        }
                      >
                        {message.role === "assistant" ? (
                          <SpeechBubble title={assistantBrand} body={message.text} compact />
                        ) : (
                          <div className="inline-block max-w-full rounded-[1.45rem] border border-[#8CEBFF]/16 bg-[linear-gradient(135deg,rgba(56,189,248,0.26),rgba(99,102,241,0.3),rgba(140,91,255,0.3))] px-4 py-3 text-sm leading-6 text-white shadow-[0_14px_28px_rgba(2,8,24,0.18)]">
                            <p className="whitespace-pre-wrap">{message.text}</p>
                          </div>
                        )}

                        {message.actions && message.actions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {message.actions.map((action) => (
                              <motion.button
                                key={action.id}
                                type="button"
                                disabled={busy}
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                  void runAction(action);
                                }}
                                className="rounded-full border border-[#8CEBFF]/16 bg-white/5 px-3 py-1.5 text-xs font-medium text-[#B9F4FF] transition hover:border-[#8CEBFF]/32 hover:bg-[#8CEBFF]/12 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {action.label}
                              </motion.button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                <AnimatePresence>
                  {busy && (
                    <motion.div
                      key="assistant-busy"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="grid grid-cols-[auto,minmax(0,1fr)] items-start gap-3.5 pr-1"
                    >
                      <ChatbotAvatar
                        mode="thinking"
                        size={48}
                        className="mt-1 shrink-0"
                      />

                      <div className="min-w-0 max-w-[19rem] sm:max-w-[20.5rem]">
                        <SpeechBubble
                          title={assistantBrand}
                          body="Thinking..."
                          compact
                          footer={
                            <div className="flex items-center gap-1.5">
                              {[0, 1, 2].map((index) => (
                                <motion.span
                                  key={index}
                                  animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
                                  transition={{
                                    duration: 0.9,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                    delay: index * 0.12,
                                  }}
                                  className="h-2.5 w-2.5 rounded-full bg-[#8CEBFF]"
                                />
                              ))}
                            </div>
                          }
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div ref={endRef} />
              </div>
            </div>

            <motion.form
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.32 }}
              onSubmit={handleSubmit}
              className="relative border-t border-[#8CEBFF]/10 px-4 py-3.5"
            >
              <div className="flex items-end gap-2.5 rounded-[1.75rem] border border-[#8CEBFF]/16 bg-[linear-gradient(180deg,rgba(8,19,47,0.92),rgba(6,16,40,0.84))] p-2 shadow-[0_18px_36px_rgba(2,8,24,0.26)]">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[1.05rem] border border-[#8CEBFF]/18 bg-[#8CEBFF]/8">
                  <ChatbotAvatar mode={avatarMode} size={30} />
                </div>
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={1}
                  placeholder={placeholder}
                  className="min-h-[2.75rem] flex-1 resize-none bg-transparent px-1.5 py-2 text-sm text-white outline-none placeholder:text-white/35"
                />
                <motion.button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  whileHover={busy || !draft.trim() ? undefined : { scale: 1.04 }}
                  whileTap={busy || !draft.trim() ? undefined : { scale: 0.96 }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#38BDF8,#7C63FF,#A855F7)] text-white shadow-[0_14px_24px_rgba(99,102,241,0.34)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                  aria-label="Send message to assistant"
                >
                  <Send className="h-4 w-4" />
                </motion.button>
              </div>
            </motion.form>
          </motion.section>
        ) : (
          <motion.div
            key="assistant-launcher"
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="pointer-events-auto"
          >
            <div
              onPointerDown={handlePanelPointerDown}
              className="teal-glow-card group relative overflow-hidden rounded-[1.6rem] px-2.5 py-2.5 text-sm font-semibold text-white"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(140,235,255,0.16),transparent_34%),radial-gradient(circle_at_right,rgba(140,91,255,0.18),transparent_34%)]" />
              <div className="relative flex items-center gap-2 pr-10">
                <button
                  type="button"
                  onClick={handleOpenAssistant}
                  className="flex min-w-0 items-center gap-3 rounded-[1.2rem] px-1 py-1 text-left transition hover:bg-white/5"
                  aria-label="Open assistant"
                >
                  <ChatbotAvatar
                    mode={avatarMode}
                    size={46}
                    className="shrink-0"
                  />

                  <div className="min-w-0 max-w-[10rem]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#9EEFFF]">
                      {assistantBrand}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-semibold text-white">
                      Open assistant
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-[#B6F7FF]">
                      <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{subtitle}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 transition group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </button>

                <div className="absolute right-2 top-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleHide}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#8CEBFF]/16 bg-white/5 text-white/72 transition hover:border-[#8CEBFF]/30 hover:bg-white/10 hover:text-white"
                    aria-label="Hide assistant"
                    title="Hide assistant"
                  >
                    <EyeOff className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>
    </div>
  );
}
