// src/lib/auth.ts
// Auth storage helper.
// Stores token + user in localStorage and keeps dev-only bypass state session-scoped.

const TOKEN_KEY = "token";
const USER_KEY = "user";
const DEV_BYPASS_KEY = "dev_bypass";
const MOCK_USER_KEY = "mock_user";
const MOCK_AUTH_CHANGED_EVENT = "mock-auth-changed";

const IS_MOCK_MODE =
  String(import.meta.env.VITE_DATA_MODE ?? "").trim().toLowerCase() === "mock";

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

export const MOCK_USERS: Record<UserRole, AuthUser> = {
  ADMIN: {
    id: "mock-admin",
    email: "admin@demo.local",
    role: "ADMIN",
    adminScope: "SUPER",
    firstName: "Demo",
    lastName: "Admin",
  },
  LECTURER: {
    id: "mock-lecturer",
    email: "lecturer@demo.local",
    role: "LECTURER",
    firstName: "Demo",
    lastName: "Lecturer",
  },
  STUDENT: {
    id: "mock-student",
    email: "student@demo.local",
    role: "STUDENT",
    firstName: "Demo",
    lastName: "Student",
    courseName: "Demo Course",
  },
  PARENT: {
    id: "mock-parent",
    email: "parent@demo.local",
    role: "PARENT",
    firstName: "Demo",
    lastName: "Parent",
  },
};

const DEFAULT_MOCK_ROLE: UserRole = "ADMIN";
const MOCK_TOKEN_PREFIX = "mock-token";

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

function emitMockAuthChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MOCK_AUTH_CHANGED_EVENT));
}

function clearDevBypassStorage(): void {
  getSessionStorage()?.removeItem(DEV_BYPASS_KEY);
  getLocalStorage()?.removeItem(DEV_BYPASS_KEY);
}

function isUserRole(value: unknown): value is UserRole {
  return (
    value === "ADMIN" ||
    value === "LECTURER" ||
    value === "STUDENT" ||
    value === "PARENT"
  );
}

function parseStoredUser(raw: string | null): AuthUser | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function getStoredMockRole(): UserRole {
  const raw = getLocalStorage()?.getItem(MOCK_USER_KEY) ?? "";
  const normalized = raw.trim().toUpperCase();
  return isUserRole(normalized) ? normalized : DEFAULT_MOCK_ROLE;
}

export function isMockMode(): boolean {
  return IS_MOCK_MODE;
}

export function getMockUsers(): AuthUser[] {
  return Object.values(MOCK_USERS);
}

export function getSelectedMockUser(): AuthUser {
  return MOCK_USERS[getStoredMockRole()];
}

export function setSelectedMockUser(role: UserRole): AuthUser {
  const user = MOCK_USERS[role];
  const storage = getLocalStorage();
  storage?.setItem(MOCK_USER_KEY, role);
  clearDevBypassStorage();
  emitMockAuthChanged();
  return user;
}

/**
 * Save auth state.
 */
export function setAuth(token: string, user: AuthUser): void {
  const storage = getLocalStorage();
  storage?.setItem(TOKEN_KEY, token);
  storage?.setItem(USER_KEY, JSON.stringify(user));
  clearDevBypassStorage();
}

/**
 * Clear auth state.
 */
export function clearAuth(): void {
  const storage = getLocalStorage();
  storage?.removeItem(TOKEN_KEY);
  storage?.removeItem(USER_KEY);
  clearDevBypassStorage();
  if (IS_MOCK_MODE) emitMockAuthChanged();
}

/**
 * Read token.
 */
export function getToken(): string | null {
  if (IS_MOCK_MODE) {
    return `${MOCK_TOKEN_PREFIX}:${getSelectedMockUser().role.toLowerCase()}`;
  }

  return getLocalStorage()?.getItem(TOKEN_KEY) ?? null;
}

/**
 * Read user.
 */
export function getUser(): AuthUser | null {
  if (IS_MOCK_MODE) {
    return getSelectedMockUser();
  }

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

/**
 * DEV BYPASS SUPPORT
 * Used by RequireDevBypass.tsx
 */
export function hasDevBypass(): boolean {
  return getSessionStorage()?.getItem(DEV_BYPASS_KEY) === "true";
}

export function setDevBypass(enabled: boolean): void {
  const storage = getSessionStorage();
  if (enabled) storage?.setItem(DEV_BYPASS_KEY, "true");
  else storage?.removeItem(DEV_BYPASS_KEY);
  getLocalStorage()?.removeItem(DEV_BYPASS_KEY);
}

export { MOCK_AUTH_CHANGED_EVENT };
