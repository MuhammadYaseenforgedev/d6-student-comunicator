// frontend/src/hooks/useMessages.ts

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChannelKey } from "../lib/types";
import type { Message, MessageCreate } from "../api/messages";
import { createMessage, deleteMessage, fetchMessages } from "../api/messages";

const MODE: "mock" | "api" = import.meta.env.VITE_DATA_MODE === "api" ? "api" : "mock";

function safeTime(s?: string) {
  const t = s ? new Date(s).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

function sortMessages(items: Message[]) {
  // chat style: oldest -> newest
  return [...items].sort((a, b) => safeTime(a.createdAt) - safeTime(b.createdAt));
}

export function useMessages(channel?: ChannelKey) {
  const [items, setItems] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function load() {
    setError(null);
    setLoading(true);

    try {
      if (MODE === "mock") {
        // If you have a mock message store, you can plug it here later.
        // For now, keep mock empty so it doesn't crash builds.
        if (mountedRef.current) setItems([]);
        return;
      }

      const key: ChannelKey = channel ?? "general";
      const rows = await fetchMessages(key);

      if (mountedRef.current) setItems(sortMessages(rows));
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load messages");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function create(payload: MessageCreate) {
    setError(null);

    if (MODE === "mock") {
      // no-op for now
      return;
    }

    // optimistic
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      channel: payload.channel,
      body: payload.body,
      author: payload.author ?? "You",
      createdAt: new Date().toISOString(),
    };

    setItems((prev) => sortMessages([...prev, optimistic]));

    try {
      const saved = await createMessage(payload);
      setItems((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== optimistic.id);
        return sortMessages([...withoutTemp, saved]);
      });
    } catch (e: unknown) {
      setItems((prev) => prev.filter((m) => m.id !== optimistic.id));
      setError(e instanceof Error ? e.message : "Failed to create message");
    }
  }

  async function remove(messageId: string) {
    setError(null);

    if (MODE === "mock") return;

    const key: ChannelKey = channel ?? "general";
    const before = items;

    // optimistic remove
    setItems((prev) => prev.filter((m) => m.id !== messageId));

    try {
      await deleteMessage(key, messageId);
    } catch (e: unknown) {
      // rollback
      setItems(before);
      setError(e instanceof Error ? e.message : "Failed to delete message");
    }
  }

  function clearError() {
    setError(null);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const filtered = useMemo(() => {
    if (!channel) return items;
    return items.filter((m) => m.channel === channel);
  }, [items, channel]);

  return {
    items: filtered,
    allItems: items,
    loading,
    error,
    clearError,
    reload: load,
    create,
    remove,
    mode: MODE,
  };
}
