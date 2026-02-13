// src/lib/auth.ts
// Local auth storage helper.
// Today: stores token + user in localStorage.
// Later: token will be a real JWT from backend, and user will come from /auth/me or login response.

const TOKEN_KEY = "token";
const USER_KEY = "user";

/**
 * Roles used throughout the app.
 * Backend will enforce these, frontend uses them for UI + route guards.
 */
export type UserRole = "STUDENT" | "LECTURER" | "ADMIN" | "PARENT";

/**
 * Authenticated user shape stored on the frontend.
 * NOTE: campusId is the "ID" your manager requested (parent links child by ID, not email).
 */
export type AuthUser = {
  id: string; // backend user id (or dev id while backend not plugged in)
  email: string;
  role: UserRole;
  campusId?: string; // ✅ the ID used at registration (student ID / campus ID / etc)
};

/**
 * Save auth state.
 */
export function setAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Clear auth state.
 */
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Read token.
 */
export function getToken() {
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
export function isAuthed() {
  return Boolean(getToken() && getUser());
}
