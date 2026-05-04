import { useEffect, useMemo, useRef, useState } from "react";
import type { Announcement, AnnouncementCreate, ChannelKey } from "../lib/types";
import {
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncements,
  updateAnnouncement,
} from "../api/announcements";
import { getUser } from "../lib/auth";

function safeTime(s?: string) {
  const t = s ? new Date(s).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

function isAnnouncementActive(announcement: Announcement, at: number) {
  const expiresAt = safeTime(announcement.expiresAt ?? undefined);
  if (!expiresAt) return true;
  return expiresAt > at;
}

function sortAnnouncements(items: Announcement[]) {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return safeTime(b.createdAt) - safeTime(a.createdAt);
  });
}

type UpdatePayload = {
  id: string;
  title?: string;
  body?: string;
  pinned?: boolean;
};

export function useAnnouncements(
  channel?: ChannelKey,
  options?: { moduleId?: string; enabled?: boolean }
) {
  const user = getUser();
  const role = String(user?.role ?? "").toUpperCase();
  const adminScope = String(user?.adminScope ?? "").toUpperCase();
  const canManage =
    role === "LECTURER" || (role === "ADMIN" && adminScope !== "FINANCE");

  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeCursor, setTimeCursor] = useState(() => Date.now());
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function load() {
    if (options?.enabled === false) {
      if (mountedRef.current) {
        setItems([]);
        setLoading(false);
      }
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const key: ChannelKey = channel ?? "general";
      const rows = await fetchAnnouncements(key, { moduleId: options?.moduleId });
      if (mountedRef.current) {
        setItems(sortAnnouncements(rows));
        setTimeCursor(Date.now());
      }
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load announcements");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  loadRef.current = load;

  async function create(payload: AnnouncementCreate) {
    setError(null);
    try {
      const saved = await createAnnouncement(payload);
      if (!mountedRef.current) return;
      setItems((prev) => sortAnnouncements([saved, ...prev]));
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to create announcement");
      throw e;
    }
  }

  async function update(payload: UpdatePayload) {
    setError(null);
    if (!channel) return;
    try {
      const saved = await updateAnnouncement({
        channel,
        id: payload.id,
        title: payload.title,
        body: payload.body,
        pinned: payload.pinned,
      });
      if (!mountedRef.current) return;
      setItems((prev) =>
        sortAnnouncements(prev.map((a) => (a.id === saved.id ? saved : a)))
      );
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to update announcement");
      throw e;
    }
  }

  async function remove(id: string) {
    setError(null);
    if (!channel) return;
    try {
      await deleteAnnouncement({ channel, id });
      if (!mountedRef.current) return;
      setItems((prev) => prev.filter((a) => a.id !== id));
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to delete announcement");
      throw e;
    }
  }

  function clearError() {
    setError(null);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, options?.moduleId, options?.enabled]);

  useEffect(() => {
    const nextExpiryAt = items.reduce((soonest, announcement) => {
      const expiresAt = safeTime(announcement.expiresAt ?? undefined);
      if (!expiresAt || expiresAt <= timeCursor) return soonest;
      if (!soonest || expiresAt < soonest) return expiresAt;
      return soonest;
    }, 0);

    if (!nextExpiryAt) return;

    const delay = Math.min(
      Math.max(nextExpiryAt - Date.now() + 1000, 1000),
      2_147_483_647
    );

    const timeoutId = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setTimeCursor(Date.now());
      void loadRef.current();
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [items, timeCursor]);

  const filtered = useMemo(() => {
    const activeItems = items.filter((announcement) =>
      isAnnouncementActive(announcement, timeCursor)
    );
    if (!channel) return activeItems;
    return activeItems.filter((a) => a.channel === channel);
  }, [items, channel, timeCursor]);

  return {
    items: filtered,
    allItems: items,
    loading,
    error,
    clearError,
    reload: load,
    create,
    update,
    remove,
    canManage,
  };
}
