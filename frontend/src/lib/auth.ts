// src/lib/auth.ts
// Auth storage helper.
// Stores token + user in localStorage.

const TOKEN_KEY = "token";
const USER_KEY = "user";
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
