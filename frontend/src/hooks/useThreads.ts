import { useEffect, useMemo, useState } from "react";
import type { Thread } from "../lib/types";
import { ensureMessagesSeeded, listMessages, listThreads } from "../lib/messageStore";
import { getUser } from "../lib/auth";

type ThreadVM = Thread & {
  lastPreview?: string;
  lastSender?: string;
  lastAt?: string;
  otherParticipant?: string;
};

export function useThreads() {
  const [raw, setRaw] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const user = getUser();
      const email = user?.email ?? "dev@local";
      ensureMessagesSeeded(email);
      setRaw(listThreads());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const items: ThreadVM[] = useMemo(() => {
    const me = getUser()?.email ?? "dev@local";

    return raw.map((t) => {
      const msgs = listMessages(t.id);
      const last = msgs[msgs.length - 1];

      const other = t.participants.find((p) => p !== me);

      return {
        ...t,
        lastPreview: last?.body ?? "No messages yet",
        lastSender: last?.sender,
        lastAt: last?.createdAt ?? t.lastMessageAt,
        otherParticipant: other ?? t.participants[0],
      };
    });
  }, [raw]);

  return { items, loading, reload: load };
}
