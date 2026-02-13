import type { Message, MessageCreate, Thread } from "./types";

const THREADS_KEY = "demo_threads_v1";
const MESSAGES_KEY = "demo_messages_v1";

function isoOffsetMinutes(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function loadJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function ensureMessagesSeeded(currentUserEmail: string) {
  const threads = loadJson<Thread[]>(THREADS_KEY, []);
  const messages = loadJson<Message[]>(MESSAGES_KEY, []);

  if (threads.length > 0 && messages.length > 0) return;

  // Seed messages with sensible times so ordering looks real
  const seedMessages: Message[] = [
    {
      id: "m1",
      threadId: "t1",
      sender: "lecturer@forge.ac.za",
      body: "Hi! Let me know if you need help with the module content.",
      createdAt: isoOffsetMinutes(35),
    },
    {
      id: "m2",
      threadId: "t1",
      sender: currentUserEmail,
      body: "Thanks! I’ll reach out if anything is unclear.",
      createdAt: isoOffsetMinutes(32),
    },
    {
      id: "m3",
      threadId: "t2",
      sender: "admin@forge.ac.za",
      body: "Welcome to the Parent portal. We can link your learner soon.",
      createdAt: isoOffsetMinutes(90),
    },
  ];

  const lastT1 = seedMessages.filter((m) => m.threadId === "t1").slice(-1)[0]?.createdAt;
  const lastT2 = seedMessages.filter((m) => m.threadId === "t2").slice(-1)[0]?.createdAt;

  const seedThreads: Thread[] = [
    {
      id: "t1",
      title: "General Support",
      participants: [currentUserEmail, "lecturer@forge.ac.za"],
      lastMessageAt: lastT1 ?? isoOffsetMinutes(30),
    },
    {
      id: "t2",
      title: "Parent Portal Help",
      participants: [currentUserEmail, "admin@forge.ac.za"],
      lastMessageAt: lastT2 ?? isoOffsetMinutes(85),
    },
  ];

  saveJson(THREADS_KEY, seedThreads);
  saveJson(MESSAGES_KEY, seedMessages);
}

export function listThreads(): Thread[] {
  const threads = loadJson<Thread[]>(THREADS_KEY, []);
  return [...threads].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

export function getThread(threadId: string): Thread | null {
  const threads = loadJson<Thread[]>(THREADS_KEY, []);
  return threads.find((t) => t.id === threadId) ?? null;
}

export function listMessages(threadId: string): Message[] {
  const msgs = loadJson<Message[]>(MESSAGES_KEY, []);
  return msgs
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function sendMessage(currentUserEmail: string, payload: MessageCreate): Message {
  const msgs = loadJson<Message[]>(MESSAGES_KEY, []);
  const threads = loadJson<Thread[]>(THREADS_KEY, []);

  const message: Message = {
    id: `m-${Date.now()}`,
    threadId: payload.threadId,
    sender: currentUserEmail,
    body: payload.body.trim(),
    createdAt: new Date().toISOString(),
  };

  const nextMsgs = [...msgs, message];
  saveJson(MESSAGES_KEY, nextMsgs);

  // Update thread lastMessageAt (create thread if missing)
  const exists = threads.some((t) => t.id === payload.threadId);
  const nextThreads = exists
    ? threads.map((t) => (t.id === payload.threadId ? { ...t, lastMessageAt: message.createdAt } : t))
    : [
        ...threads,
        {
          id: payload.threadId,
          title: "New thread",
          participants: [currentUserEmail],
          lastMessageAt: message.createdAt,
        } as Thread,
      ];

  saveJson(THREADS_KEY, nextThreads);

  return message;
}
