import { clearAuth, getToken, getUser, type AuthUser } from "./auth";
import { isMockDataMode } from "./demoAuth";

const DEMO_STORAGE_KEYS = [
  "demo_threads_v1",
  "demo_messages_v1",
  "d6_calendar_events_v1",
  "d6_calendar_notes_v1",
  "d6_finance_notifications_v1",
  "d6_finance_documents_v1",
  "d6_uploads_v1",
] as const;

function storageSafe(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function isDemoToken(token: string | null): boolean {
  const value = String(token ?? "").trim();
  return value === "local-demo-token" || value.startsWith("local-demo.");
}

function isDemoUser(user: AuthUser | null): boolean {
  const id = String(user?.id ?? "").trim().toLowerCase();
  const email = String(user?.email ?? "").trim().toLowerCase();
  return id.startsWith("demo-") || email.includes(".demo@forge.local");
}

export function clearDemoStorage(): void {
  for (const storage of [storageSafe("localStorage"), storageSafe("sessionStorage")]) {
    for (const key of DEMO_STORAGE_KEYS) {
      storage?.removeItem(key);
    }
  }
}

export function clearApiModeDemoSession(): void {
  if (isMockDataMode()) return;

  const token = getToken();
  const user = getUser();

  if (isDemoToken(token) || isDemoUser(user)) {
    clearAuth();
  }

  clearDemoStorage();
}
