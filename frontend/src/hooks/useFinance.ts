// src/hooks/useFinance.ts
import { useCallback, useEffect, useState } from "react";
import type { AccountStatus, FinanceDocument, FinanceNotification } from "../lib/types";
import {
  ensureFinanceSeeded,
  getAccountStatus,
  listFinanceDocuments,
  listFinanceNotifications,
} from "../lib/financeStore";
import { getUser } from "../lib/auth";

export function useFinance() {
  const user = getUser();
  const parentEmail = (user?.email ?? "parent@demo.com").trim().toLowerCase();

  const [status, setStatus] = useState<AccountStatus>("PAID");
  const [notifications, setNotifications] = useState<FinanceNotification[]>([]);
  const [documents, setDocuments] = useState<FinanceDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ useCallback makes "load" stable so eslint stops complaining
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      ensureFinanceSeeded(parentEmail);
      setStatus(getAccountStatus(parentEmail));
      setNotifications(listFinanceNotifications(parentEmail));
      setDocuments(listFinanceDocuments(parentEmail));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load finance info");
    } finally {
      setLoading(false);
    }
  }, [parentEmail]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    parentEmail,
    status,
    notifications,
    documents,
    loading,
    error,
    reload: load,
  };
}
