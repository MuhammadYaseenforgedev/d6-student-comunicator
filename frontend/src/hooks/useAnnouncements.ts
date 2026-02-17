// frontend/src/hooks/useAnnouncements.ts

import { useEffect, useMemo, useRef, useState } from "react";
import type { Announcement, AnnouncementCreate, ChannelKey } from "../lib/types";
import {
  addAnnouncement as addLocal,
  ensureDemoSeeded,
  getAnnouncements,
  resetAnnouncementsDemo,
} from "../lib/announcementStore";
import { createAnnouncement, fetchAnnouncements } from "../api/announcements";

function getDataMode(): "mock" | "api" {
  // Vite exposes import.meta.env, but typing can be strict depending on your setup.
  // This approach avoids `any` and stays safe.
  const env = import.meta.env as unknown;

  if (typeof env === "object" && env !== null) {
    const rec = env as Record<string, unknown>;
    const v = rec["VITE_DATA_MODE"];
    if (v === "api") return "api";
  }

  return "mock";
}

const MODE: "mock" | "api" = getDataMode();

function safeTime(s?: string) {
  const t = s ? new Date(s).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

function sortAnnouncements(items: Announcement[]) {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return safeTime(b.createdAt) - safeTime(a.createdAt);
  });
}

export function useAnnouncements(channel?: ChannelKey) {
  const [items, setItems] = useState<Announcement[]>([]);
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
        ensureDemoSeeded();
        if (mountedRef.current) setItems(sortAnnouncements(getAnnouncements()));
        return;
      }

      const key: ChannelKey = channel ?? "general";
      const rows = await fetchAnnouncements(key);

      if (mountedRef.current) setItems(sortAnnouncements(rows));
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load announcements");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function create(payload: AnnouncementCreate) {
    setError(null);

    if (MODE === "mock") {
      try {
        addLocal(payload);
        await load();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to create announcement");
      }
      return;
    }

    const optimistic: Announcement = {
      id: `temp-${Date.now()}`,
      channel: payload.channel,
      title: payload.title,
      body: payload.body,
      pinned: payload.pinned,
      author: payload.author ?? "You",
      createdAt: new Date().toISOString(),
    };

    setItems((prev) => sortAnnouncements([optimistic, ...prev]));

    try {
      const saved = await createAnnouncement(payload);

      setItems((prev) => {
        const withoutTemp = prev.filter((a) => a.id !== optimistic.id);
        return sortAnnouncements([saved, ...withoutTemp]);
      });
    } catch (e: unknown) {
      setItems((prev) => prev.filter((a) => a.id !== optimistic.id));
      setError(e instanceof Error ? e.message : "Failed to create announcement");
    }
  }

  function resetDemo() {
    if (MODE !== "mock") return;
    resetAnnouncementsDemo();
    setItems(sortAnnouncements(getAnnouncements()));
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
    return items.filter((a) => a.channel === channel);
  }, [items, channel]);

  return {
    items: filtered,
    allItems: items,
    loading,
    error,
    clearError,
    reload: load,
    create,
    resetDemo,
    mode: MODE,
  };
}
