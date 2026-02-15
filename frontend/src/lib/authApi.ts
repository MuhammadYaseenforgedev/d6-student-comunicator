// src/lib/authApi.ts
// API client for OTP auth + registration.
//
// Requirements (real-world):
// - Login requires: email + password + OTP (OTP sent to email)
// - Register requires: campusId + email + password + OTP (OTP sent to email)
// - No React hooks in this file (this is not React land)
// - No "any"
// - Strong error handling for user-friendly messages
//
// Dev fallback:
// - If VITE_API_URL is missing/empty, we simulate OTP flows locally.
// - Dev OTP is 000000.

import type { AuthUser, UserRole } from "./auth";

/**
 * Vite env access (typed).
 * We avoid `any` and we don't assume the env shape is always present.
 */
type ViteEnv = {
  VITE_API_URL?: string;
};

const env = (import.meta as unknown as { env: ViteEnv }).env;
const BASE_URL = env?.VITE_API_URL?.trim() ?? "";

/**
 * OTP challenge returned by backend.
 * Frontend stores challengeId and then verifies OTP using it.
 */
export type OtpChallenge = {
  challengeId: string;
  email: string;
  purpose: "LOGIN" | "REGISTER";
  expiresAt: string; // ISO string
};

/**
 * Expected backend error shape (common pattern).
 * If your backend uses { error: "..." } instead, tell me and I’ll adapt it.
 */
type ApiErrorBody = {
  message?: unknown;
};

/**
 * Normalize email so the backend and frontend always treat the user consistently.
 */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Dev fallback toggle:
 * If BASE_URL is empty, we assume backend is not wired yet.
 */
function isDevFallbackEnabled() {
  return BASE_URL.length === 0;
}

/**
 * Fetch timeout helper.
 * In production you do NOT want hanging requests.
 */
function withTimeout(ms: number) {
  return new AbortControllerWithTimeout(ms);
}

/**
 * Small wrapper class so we keep the controller + cleanup logic together.
 */
class AbortControllerWithTimeout {
  public controller: AbortController;
  private timer: number | null;

  constructor(ms: number) {
    this.controller = new AbortController();
    this.timer = window.setTimeout(() => {
      this.controller.abort();
    }, ms);
  }

  cleanup() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Read error message safely from the backend response.
 */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as ApiErrorBody;
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message;
    }
  } catch {
    // ignore parsing errors
  }
  return `Request failed (${res.status})`;
}

/**
 * Generic API caller that:
 * - handles timeout
 * - throws clean errors
 * - returns strongly typed JSON
 */
async function api<T>(path: string, init: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;

  // 15s timeout (adjust if needed)
  const t = withTimeout(15_000);

  try {
    const res = await fetch(url, {
      ...init,
      signal: t.controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!res.ok) {
      throw new Error(await readErrorMessage(res));
    }

    return (await res.json()) as T;
  } catch (err) {
    // Abort error → friendlier message
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw err;
  } finally {
    t.cleanup();
  }
}

/**
 * DEV: create a fake user object.
 * Used ONLY when backend isn't connected.
 */
function devUser(params: {
  role: UserRole;
  email: string;
  campusId?: string;
}): AuthUser {
  return {
    id: `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    email: params.email,
    role: params.role,
    campusId: params.campusId,
  };
}

/* ============================================================================
   LOGIN (email + password -> OTP challenge -> verify OTP -> token + user)
   ============================================================================ */

/**
 * Step 1: Request OTP for login.
 * Backend should validate email/password, send OTP to email, return challengeId.
 */
export async function requestLoginOtp(params: {
  email: string;
  password: string;
}): Promise<OtpChallenge> {
  const email = normalizeEmail(params.email);

  if (isDevFallbackEnabled()) {
    return {
      challengeId: `dev-login-${Date.now()}`,
      email,
      purpose: "LOGIN",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  return api<OtpChallenge>("/auth/login/otp/request", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: params.password,
    }),
  });
}

/**
 * Step 2: Verify OTP for login.
 * Backend verifies challengeId + otp, returns token + user.
 */
export async function verifyLoginOtp(params: {
  challengeId: string;
  otp: string;
}): Promise<{ token: string; user: AuthUser }> {
  if (isDevFallbackEnabled()) {
    if (params.otp.trim() !== "000000") {
      throw new Error("Invalid OTP (dev: use 000000)");
    }

    // DEV default: return a student user (you can change role in the UI by registering)
    return {
      token: `dev-token-${Date.now()}`,
      user: devUser({
        role: "STUDENT",
        email: "student@demo.com",
        campusId: "STU-1001",
      }),
    };
  }

  return api<{ token: string; user: AuthUser }>("/auth/login/otp/verify", {
    method: "POST",
    body: JSON.stringify({
      challengeId: params.challengeId,
      otp: params.otp,
    }),
  });
}

/* ============================================================================
   REGISTER (campusId + email + password -> OTP challenge -> verify OTP -> token + user)
   ============================================================================ */

/**
 * Step 1: Request OTP for registration.
 * Backend validates:
 * - campusId exists
 * - email is valid + not already registered
 * - password meets policy
 * Then sends OTP to email and returns challengeId.
 */
export async function requestRegisterOtp(params: {
  campusId: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<OtpChallenge> {
  const email = normalizeEmail(params.email);
  const campusId = params.campusId.trim();

  if (isDevFallbackEnabled()) {
    return {
      challengeId: `dev-register-${Date.now()}`,
      email,
      purpose: "REGISTER",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  return api<OtpChallenge>("/auth/register/otp/request", {
    method: "POST",
    body: JSON.stringify({
      campusId,
      email,
      password: params.password,
      role: params.role,
    }),
  });
}

/**
 * Step 2: Verify OTP for registration.
 * Backend verifies OTP and creates user, then returns token + user.
 */
export async function verifyRegisterOtp(params: {
  challengeId: string;
  otp: string;
}): Promise<{ token: string; user: AuthUser }> {
  if (isDevFallbackEnabled()) {
    if (params.otp.trim() !== "000000") {
      throw new Error("Invalid OTP (dev: use 000000)");
    }

    // DEV: simulate a registered student by default
    return {
      token: `dev-token-${Date.now()}`,
      user: devUser({
        role: "STUDENT",
        email: "newuser@demo.com",
        campusId: "STU-9999",
      }),
    };
  }

  return api<{ token: string; user: AuthUser }>("/auth/register/otp/verify", {
    method: "POST",
    body: JSON.stringify({
      challengeId: params.challengeId,
      otp: params.otp,
    }),
  });
}
