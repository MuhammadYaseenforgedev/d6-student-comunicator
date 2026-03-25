import { useEffect, useState } from "react";
import {
  fetchNotificationSummary,
  subscribeNotificationsRefresh,
  type NotificationSummary,
} from "../api/notifications";

const EMPTY_SUMMARY: NotificationSummary = {
  totalUnread: 0,
  counts: {},
};

export function useNotificationSummary(pollMs = 20_000) {
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY_SUMMARY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await fetchNotificationSummary();
        if (cancelled) return;
        setSummary({
          totalUnread: Number(next.totalUnread ?? 0),
          counts: next.counts ?? {},
        });
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load notifications");
      }
    }

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, pollMs);
    const unsubscribe = subscribeNotificationsRefresh(() => {
      void load();
    });
    const onFocus = () => {
      void load();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [pollMs]);

  return { summary, error };
}
