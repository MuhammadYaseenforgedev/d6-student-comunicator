// frontend/src/hooks/useEvents.ts

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChannelKey } from "../lib/types";
import { createEvent, fetchEvents, type UiEvent } from "../api/events";

const MODE: "mock" | "api" =
  (typeof import.meta !== "undefined" &&
    typeof (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DATA_MODE === "string" &&
    (import.meta as unknown as { env: Record<string, string> }).env.VITE_DATA_MODE === "api")
    ? "api"
    : "mock";

function safeTime(s?: string) {
  const t = s ? new Date(s).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

function sortEvents(items: UiEvent[]) {
  return [...items].sort((a, b) => safeTime(a.startsAt) - safeTime(b.startsAt));
}

export function useEvents(channel?: ChannelKey) {
  const [items, setItems] = useState<UiEvent[]>([]);
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
        // If you have a mock store for calendar, plug it in here.
        // For now, mock mode just shows no events.
        if (mountedRef.current) setItems([]);
        return;
      }

      const key: ChannelKey = channel ?? "general";
      const rows = await fetchEvents(key);

      if (mountedRef.current) setItems(sortEvents(rows));
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load events");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function create(payload: {
    channel: ChannelKey;
    title: string;
    description?: string;
    location?: string;
    startsAt: string;
    endsAt: string;
  }) {
    setError(null);

    if (MODE === "mock") {
      setError("Mock mode is enabled. Set VITE_DATA_MODE=api to save events.");
      return;
    }

    // optimistic UI
    const optimistic: UiEvent = {
      id: `temp-${Date.now()}`,
      channel: payload.channel,
      title: payload.title,
      description: payload.description,
      location: payload.location,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      author: "You",
      createdAt: new Date().toISOString(),
    };

    setItems((prev) => sortEvents([optimistic, ...prev]));

    try {
      const saved = await createEvent(payload);
      setItems((prev) => {
        const withoutTemp = prev.filter((e) => e.id !== optimistic.id);
        return sortEvents([saved, ...withoutTemp]);
      });
    } catch (e: unknown) {
      setItems((prev) => prev.filter((ev) => ev.id !== optimistic.id));
      setError(e instanceof Error ? e.message : "Failed to create event");
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
    return items.filter((e) => e.channel === channel);
  }, [items, channel]);

  return {
    items: filtered,
    allItems: items,
    loading,
    error,
    clearError,
    reload: load,
    create,
    mode: MODE,
  };
}
