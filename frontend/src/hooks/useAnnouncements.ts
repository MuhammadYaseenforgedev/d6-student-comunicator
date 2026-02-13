import { useEffect, useMemo, useRef, useState } from "react";
import type { Announcement, AnnouncementCreate, ChannelKey } from "../lib/types";
import {
  addAnnouncement as addLocal,
  ensureDemoSeeded,
  getAnnouncements,
  resetAnnouncementsDemo,
} from "../lib/announcementStore";
import * as apiAnnouncements from "../api/announcements";

// Change this later to "api" when backend is ready
const MODE: "mock" | "api" = "mock";

function sortAnnouncements(items: Announcement[]) {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
        const all = getAnnouncements();
        if (mountedRef.current) setItems(sortAnnouncements(all));
      } else {
        const all = await apiAnnouncements.fetchAnnouncements(channel);
        if (mountedRef.current) setItems(sortAnnouncements(all));
      }
    } catch (e: unknown) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Failed to load announcements");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function create(payload: AnnouncementCreate) {
    setError(null);

    // MOCK: create then reload
    if (MODE === "mock") {
      try {
        addLocal(payload);
        await load();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to create announcement");
      }
      return;
    }

    // API: optimistic UI
    const optimistic: Announcement = {
      id: `temp-${Date.now()}`,
      channel: payload.channel,
      title: payload.title,
      body: payload.body,
      pinned: payload.pinned,
      author: payload.author,
      createdAt: new Date().toISOString(),
    };

    // Add optimistic item immediately
    setItems((prev) => sortAnnouncements([optimistic, ...prev]));

    try {
      const saved = await apiAnnouncements.createAnnouncement(payload);

      // Replace optimistic with real one
      setItems((prev) => {
        const withoutTemp = prev.filter((a) => a.id !== optimistic.id);
        return sortAnnouncements([saved, ...withoutTemp]);
      });
    } catch (e: unknown) {
      // Rollback optimistic
      setItems((prev) => prev.filter((a) => a.id !== optimistic.id));
      setError(e instanceof Error ? e.message : "Failed to create announcement");
    }
  }

  function resetDemo() {
    if (MODE !== "mock") return;
    resetAnnouncementsDemo();
    const all = getAnnouncements();
    setItems(sortAnnouncements(all));
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
