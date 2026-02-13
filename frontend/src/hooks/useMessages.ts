import { useEffect, useState } from "react";
import type { Message } from "../lib/types";
import { getUser } from "../lib/auth";
import { listMessages, sendMessage } from "../lib/messageStore";

export function useMessages(threadId: string) {
  const [items, setItems] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  async function load() {
    if (!threadId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      setItems(listMessages(threadId));
    } finally {
      setLoading(false);
    }
  }

  async function send(body: string) {
    const trimmed = body.trim();
    if (!trimmed || !threadId) return;

    const user = getUser();
    const email = user?.email ?? "dev@local";

    setSending(true);
    try {
      // optimistic-ish: update immediately after local write
      sendMessage(email, { threadId, body: trimmed });
      setItems(listMessages(threadId));
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  return { items, loading, sending, reload: load, send };
}
