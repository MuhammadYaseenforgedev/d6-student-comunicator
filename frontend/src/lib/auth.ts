// src/lib/auth.ts
// Auth storage helper.
// Stores token + user in localStorage.

const TOKEN_KEY = "token";
const USER_KEY = "user";
const DEV_BYPASS_KEY = "dev_bypass";

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

/**
 * Save auth state.
 */
export function setAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Clear auth state.
 */
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Read token.
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Read user.
 */
export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Basic auth check.
 */
export function isAuthed(): boolean {
  return Boolean(getToken() && getUser());
}

/**
 * DEV BYPASS SUPPORT
 * Used by RequireDevBypass.tsx
 */
export function hasDevBypass(): boolean {
  return localStorage.getItem(DEV_BYPASS_KEY) === "true";
}

export function setDevBypass(enabled: boolean): void {
  if (enabled) localStorage.setItem(DEV_BYPASS_KEY, "true");
  else localStorage.removeItem(DEV_BYPASS_KEY);
}
