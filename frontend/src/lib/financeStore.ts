// src/lib/financeStore.ts
import type { AccountStatus, FinanceDocument, FinanceNotification } from "./types";

const NOTIFS_KEY = "d6_finance_notifications_v1";
const DOCS_KEY = "d6_finance_documents_v1";

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

// Seed demo finance content so parents can see something instantly
export function ensureFinanceSeeded(parentEmail: string) {
  const notifs = loadJson<FinanceNotification[]>(NOTIFS_KEY, []);
  const docs = loadJson<FinanceDocument[]>(DOCS_KEY, []);

  const hasParent = notifs.some((n) => n.parentEmail === parentEmail) || docs.some((d) => d.parentEmail === parentEmail);
  if (hasParent) return;

  const now = new Date().toISOString();

  const seedNotifs: FinanceNotification[] = [
    {
      id: `fn-${Date.now()}-1`,
      parentEmail,
      status: "OUTSTANDING",
      message: "Your account has an outstanding balance. Please review the latest statement.",
      createdAt: now,
    },
    {
      id: `fn-${Date.now()}-2`,
      parentEmail,
      status: "OUTSTANDING",
      message: "Reminder: Payment due within 7 days to avoid penalties.",
      createdAt: now,
    },
  ];

  // NOTE: We store a tiny “fake file” as dataUrl for MVP.
  // When backend is ready, this becomes a real file download link or presigned URL.
  const fakeText = `D6 Finance Statement\nParent: ${parentEmail}\nGenerated: ${new Date().toLocaleString()}`;
  const dataUrl = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(fakeText)))}`;

  const seedDocs: FinanceDocument[] = [
    {
      id: `fd-${Date.now()}-1`,
      parentEmail,
      title: "Statement (Demo)",
      fileName: "statement-demo.txt",
      mimeType: "text/plain",
      size: fakeText.length,
      dataUrl,
      uploadedAt: now,
      uploadedBy: "campus@forge.ac.za",
    },
  ];

  saveJson(NOTIFS_KEY, [...seedNotifs, ...notifs]);
  saveJson(DOCS_KEY, [...seedDocs, ...docs]);
}

export function listFinanceNotifications(parentEmail: string): FinanceNotification[] {
  const all = loadJson<FinanceNotification[]>(NOTIFS_KEY, []);
  return all
    .filter((n) => n.parentEmail === parentEmail)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listFinanceDocuments(parentEmail: string): FinanceDocument[] {
  const all = loadJson<FinanceDocument[]>(DOCS_KEY, []);
  return all
    .filter((d) => d.parentEmail === parentEmail)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function getAccountStatus(parentEmail: string): AccountStatus {
  // Simple rule: latest notification status (or default PAID)
  const notifs = listFinanceNotifications(parentEmail);
  return notifs[0]?.status ?? "PAID";
}
