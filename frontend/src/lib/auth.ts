// src/lib/auth.ts
// Auth storage helper.
// Stores token + user in localStorage.

const TOKEN_KEY = "token";
const USER_KEY = "user";
const LOGOUT_NOTICE_KEY = "auth.logout.notice";
const DEMO_STORAGE_KEYS = [
  "demo_threads_v1",
  "demo_messages_v1",
  "d6_calendar_events_v1",
  "d6_calendar_notes_v1",
  "d6_finance_notifications_v1",
  "d6_finance_documents_v1",
  "d6_uploads_v1",
] as const;
/**
 * Roles used throughout the app.
 * Backend will enforce these, frontend uses them for UI + route guards.
 */
export type UserRole = "STUDENT" | "LECTURER" | "ADMIN" | "PARENT";
export type AdminScope = "FINANCE" | "ACADEMIC" | "SUPER";

/**
 * Authenticated user shape stored on the frontend.
 * campusId is optional (used for parent-child linking if your backend supports it later).
 */
export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  adminScope?: AdminScope | null;
  campusId?: string;
  firstName?: string | null;
  lastName?: string | null;
  courseName?: string | null;
};

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parseStoredUser(raw: string | null): AuthUser | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Save auth state.
 */
export function setAuth(token: string, user: AuthUser): void {
  const storage = getLocalStorage();
  storage?.setItem(TOKEN_KEY, token);
  storage?.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Clear auth state.
 */
export function clearAuth(): void {
  const storage = getLocalStorage();
  storage?.removeItem(TOKEN_KEY);
  storage?.removeItem(USER_KEY);
}

function clearDemoStorage(): void {
  const localStorage = getLocalStorage();
  const sessionStorage = getSessionStorage();

  for (const key of DEMO_STORAGE_KEYS) {
    localStorage?.removeItem(key);
    sessionStorage?.removeItem(key);
  }
}

function setLogoutNotice(message: string): void {
  const storage = getSessionStorage();
  const nextMessage = message.trim();

  if (!nextMessage) {
    storage?.removeItem(LOGOUT_NOTICE_KEY);
    return;
  }

  storage?.setItem(LOGOUT_NOTICE_KEY, nextMessage);
}

export function consumeLogoutNotice(): string | null {
  const storage = getSessionStorage();
  const message = storage?.getItem(LOGOUT_NOTICE_KEY)?.trim() ?? "";

  storage?.removeItem(LOGOUT_NOTICE_KEY);
  return message || null;
}

export function logout(message?: string): void {
  clearAuth();
  clearDemoStorage();
  setLogoutNotice(message ?? "");
}

/**
 * Read token.
 */
export function getToken(): string | null {
  return getLocalStorage()?.getItem(TOKEN_KEY) ?? null;
}

/**
 * Read user.
 */
export function getUser(): AuthUser | null {
  const storage = getLocalStorage();
  const raw = storage?.getItem(USER_KEY) ?? null;
  const parsed = parseStoredUser(raw);
  if (parsed) return parsed;

  storage?.removeItem(USER_KEY);
  return null;
}

export function getCurrentUser(): AuthUser | null {
  return getUser();
}

/**
 * Basic auth check.
 */
export function isAuthed(): boolean {
  return Boolean(getToken() && getUser());
}
