// src/pages/Login-Page2.tsx
// REAL AUTH (backend + JWT + OTP).
// Flow:
// 1) Request OTP: POST /auth/request-otp (fallback /api/auth/request-otp)
// 2) Register: POST /auth/register (fallback /api/auth/register) with otp
//    - STUDENT requires southAfricanId + studentNumber
// 3) Login: POST /auth/login (fallback /api/auth/login) with optional otp
//    - STUDENT requires studentNumber
//
// Stores token + user in localStorage via setAuth so RequireAuth routing works.

import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { setAuth, type UserRole } from "../lib/auth";

type LocationState = { from?: string };
type Mode = "login" | "register";

function landingFor(role: UserRole) {
  return role === "PARENT" ? "/app/parent" : "/app";
}

type AuthUserDTO = { id: string; email: string; role: UserRole };
type LoginResponse = { token: string; user?: AuthUserDTO };
type RegisterResponse = { token?: string; user?: AuthUserDTO; message?: string };
type OtpResponse = { ok: boolean; expiresAt?: string; devCode?: string };

const API_BASE = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
if (import.meta.env.PROD && !API_BASE) {
  throw new Error("VITE_API_URL is required for production builds.");
}

type HttpError = Error & { status?: number; raw?: unknown };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function extractMessage(raw: unknown, fallback: string) {
  if (typeof raw === "string" && raw.trim()) return raw;

  if (isRecord(raw)) {
    const msg = raw.message;
    if (typeof msg === "string" && msg.trim()) return msg;

    const err = raw.error;
    if (typeof err === "string" && err.trim()) return err;

    if (isRecord(err)) {
      const errMsg = err.message;
      if (typeof errMsg === "string" && errMsg.trim()) return errMsg;
    }

    try {
      return JSON.stringify(raw);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function extractErrorCode(raw: unknown): string {
  if (!isRecord(raw)) return "";
  const code = raw.code;
  if (typeof code === "string" && code.trim()) return code.trim().toUpperCase();
  const err = raw.error;
  if (isRecord(err)) {
    const nestedCode = err.code;
    if (typeof nestedCode === "string" && nestedCode.trim()) return nestedCode.trim().toUpperCase();
  }
  return "";
}

function isOtpRequiredLoginError(error: HttpError, otpCode: string): boolean {
  if (otpCode.trim()) return false;

  const status = Number(error?.status ?? 0);
  if (![400, 401].includes(status)) return false;

  const msg = String(error?.message ?? "").toLowerCase();
  const code = extractErrorCode(error?.raw);

  // Backends vary: explicit "OTP required" or generic "Missing fields" when OTP is enforced.
  if (msg.includes("otp required") || msg.includes("otp") || code === "OTP_REQUIRED") return true;
  if (status === 400 && code === "VALIDATION" && msg.includes("missing fields")) return true;
  return false;
}

function loginErrorBanner(error: HttpError, otpCode: string): string {
  if (isOtpRequiredLoginError(error, otpCode)) {
    return "OTP required for this environment. Request OTP, then retry.";
  }

  const status = Number(error?.status ?? 0);
  if (status === 401) return "Invalid credentials. Check email/password (and student number for student accounts).";
  if (status === 403) return "Access denied for this account in the current environment.";
  if (status === 429) return "Too many login attempts. Please wait a minute and retry.";
  return error?.message ?? "Something went wrong.";
}

function normalizeStudentNumber(v: string): string {
  return v.trim().toUpperCase();
}

function normalizeSouthAfricanId(v: string): string {
  return v.replace(/\D+/g, "");
}

async function jsonFetch<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();

  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err: HttpError = new Error(extractMessage(data, `Request failed (${res.status})`));
    err.status = res.status;
    err.raw = data;
    throw err;
  }

  return data as T;
}

/** Tries a primary path, if it 404s then tries the fallback. */
async function tryPath<T>(primaryUrl: string, fallbackUrl: string, init: RequestInit): Promise<T> {
  try {
    return await jsonFetch<T>(primaryUrl, init);
  } catch (e) {
    const status = (e as HttpError)?.status;
    if (status === 404) return await jsonFetch<T>(fallbackUrl, init);
    throw e;
  }
}

export default function LoginPage2() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from;

  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [southAfricanId, setSouthAfricanId] = useState("");

  // backend expects role on register
  const [role, setRole] = useState<UserRole>("STUDENT");
  const [staffRegisterPassword, setStaffRegisterPassword] = useState("");

  // OTP may be required by backend policy.
  const [otp, setOtp] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = useMemo(() => (mode === "login" ? "Sign in" : "Create your account"), [mode]);
  const roleNeedsStaffPassword = mode === "register" && (role === "ADMIN" || role === "LECTURER");
  const roleNeedsStudentIdentity = mode === "register" && role === "STUDENT";

  async function fetchMe(token: string) {
    const me = await tryPath<{ user: AuthUserDTO }>(
      `${API_BASE}/api/auth/me`,
      `${API_BASE}/auth/me`,
      { method: "GET", headers: { Authorization: `Bearer ${token}` } }
    );
    return me.user;
  }

  async function requestOtp(purpose: "LOGIN" | "REGISTER") {
    const eNorm = email.trim().toLowerCase();
    if (!eNorm) throw new Error("Please enter an email first.");

    // Clear old messages, keep user-entered otp until we get a devCode
    setError(null);
    setInfo(null);

    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: eNorm, purpose }),
    };

    const data = await tryPath<OtpResponse>(
      `${API_BASE}/api/auth/request-otp`,
      `${API_BASE}/auth/request-otp`,
      init
    );

    if (data?.devCode) {
      setOtp(data.devCode);
      setInfo(`OTP generated (devCode auto-filled). Expires: ${data.expiresAt ?? "soon"}`);
    } else {
      setInfo("OTP requested. Check backend terminal for the OTP code (dev) or your email (prod).");
    }
  }

  async function doLogin(eNorm: string, pw: string, otpCode: string, studentNumberInput: string) {
    const payload: {
      email: string;
      password: string;
      otp?: string;
      studentNumber: string;
    } = {
      email: eNorm,
      password: pw,
      studentNumber: normalizeStudentNumber(studentNumberInput),
    };

    if (otpCode.trim()) {
      payload.otp = otpCode.trim();
    }

    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    };

    const data = await tryPath<LoginResponse>(
      `${API_BASE}/api/auth/login`,
      `${API_BASE}/auth/login`,
      init
    );

    if (!data?.token) throw new Error("Login succeeded but no token was returned.");

    const user = data.user ?? (await fetchMe(data.token));
    setAuth(data.token, user);

    const dest = from ?? landingFor(user.role);
    navigate(dest, { replace: true });
  }

  async function doRegister(
    eNorm: string,
    pw: string,
    otpCode: string,
    selectedRole: UserRole,
    staffPassword: string,
    studentNumberInput: string,
    southAfricanIdInput: string
  ) {
    const payload: {
      email: string;
      password: string;
      role: UserRole;
      otp: string;
      staffRegisterPassword?: string;
      studentNumber?: string;
      southAfricanId?: string;
    } = {
      email: eNorm,
      password: pw,
      role: selectedRole,
      otp: otpCode,
    };

    if (selectedRole === "ADMIN" || selectedRole === "LECTURER") {
      payload.staffRegisterPassword = staffPassword;
    }
    if (selectedRole === "STUDENT") {
      payload.studentNumber = normalizeStudentNumber(studentNumberInput);
      payload.southAfricanId = normalizeSouthAfricanId(southAfricanIdInput);
    }

    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    };

    const data = await tryPath<RegisterResponse>(
      `${API_BASE}/api/auth/register`,
      `${API_BASE}/auth/register`,
      init
    );

    if (data?.token) {
      const user = data.user ?? (await fetchMe(data.token));
      setAuth(data.token, user);

      const dest = from ?? landingFor(user.role);
      navigate(dest, { replace: true });
      return;
    }

    setMode("login");
    setOtp("");
    setInfo("Account created. Please sign in.");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const eNorm = email.trim().toLowerCase();
    const studentNumberNorm = normalizeStudentNumber(studentNumber);
    const southAfricanIdNorm = normalizeSouthAfricanId(southAfricanId);
    if (!eNorm) return setError("Please enter an email.");

    if (!password || password.length < 6) return setError("Password must be at least 6 characters.");

    if (mode === "register" && password !== confirmPassword) {
      return setError("Passwords do not match.");
    }

    if (roleNeedsStaffPassword && !staffRegisterPassword.trim()) {
      return setError("Staff registration password is required for Admin/Lecturer roles.");
    }

    if (roleNeedsStudentIdentity) {
      if (!studentNumberNorm) {
        return setError("Student number is required for student registration.");
      }
      if (!southAfricanIdNorm) {
        return setError("South African ID is required for student registration.");
      }
      if (!/^\d{13}$/.test(southAfricanIdNorm)) {
        return setError("South African ID must be exactly 13 digits.");
      }
    }

    if (mode === "register" && !otp.trim()) {
      return setError("OTP is required for registration. Click 'Request OTP' first, then enter the code.");
    }

    try {
      setBusy(true);
      if (mode === "login") {
        await doLogin(eNorm, password, otp.trim(), studentNumberNorm);
      } else {
        await doRegister(
          eNorm,
          password,
          otp.trim(),
          role,
          staffRegisterPassword.trim(),
          studentNumberNorm,
          southAfricanIdNorm
        );
      }
    } catch (err) {
      const e2 = err as HttpError;
      if (mode === "login") {
        setError(loginErrorBanner(e2, otp));
      } else {
        setError(e2?.message ?? "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  const canRequestOtp = !!email.trim() && !busy;
  const canSubmit =
    (mode === "login" || !!otp.trim()) &&
    !busy &&
    (!roleNeedsStaffPassword || !!staffRegisterPassword.trim()) &&
    (!roleNeedsStudentIdentity ||
      (!!normalizeStudentNumber(studentNumber) && /^\d{13}$/.test(normalizeSouthAfricanId(southAfricanId))));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 backdrop-blur-xl p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent">
              Forge Communicator
            </span>
          </h1>

          <p className="mt-2 text-sm text-white/70">
            Real auth (backend + JWT + OTP). Local integration mode.
          </p>

          <div className="mt-6 grid grid-cols-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setInfo(null);
                setOtp("");
                setStaffRegisterPassword("");
                setSouthAfricanId("");
              }}
              className={[
                "rounded-lg py-2 text-sm font-semibold transition",
                mode === "login"
                  ? "bg-white/10 text-white"
                  : "text-white/75 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
                setInfo(null);
                setOtp("");
                setStaffRegisterPassword("");
                setSouthAfricanId("");
              }}
              className={[
                "rounded-lg py-2 text-sm font-semibold transition",
                mode === "register"
                  ? "bg-white/10 text-white"
                  : "text-white/75 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              Register
            </button>
          </div>

          <h2 className="mt-6 text-lg font-semibold">{title}</h2>

          {info && (
            <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm text-cyan-100">
              {info}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-4 space-y-4" autoComplete="on">
            <div>
              <label htmlFor="email" className="block text-sm text-white/80">
                Email
              </label>
              <input
                id="email"
                name="username"
                type="email"
                className="mt-2 w-full rounded-lg bg-black/25 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/50"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                disabled={busy}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-white/80">
                Password
              </label>
              <input
                id="password"
                name={mode === "login" ? "current-password" : "new-password"}
                type="password"
                className="mt-2 w-full rounded-lg bg-black/25 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/50"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                disabled={busy}
              />
            </div>

            {(mode === "login" || roleNeedsStudentIdentity) && (
              <div>
                <label htmlFor="studentNumber" className="block text-sm text-white/80">
                  Student Number
                </label>
                <input
                  id="studentNumber"
                  name="studentNumber"
                  type="text"
                  className="mt-2 w-full rounded-lg bg-black/25 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/50"
                  placeholder="e.g. STU-1001"
                  value={studentNumber}
                  onChange={(e) => setStudentNumber(e.target.value)}
                  autoComplete="off"
                  required={roleNeedsStudentIdentity}
                  disabled={busy}
                />
                {mode === "login" && (
                  <p className="mt-2 text-xs text-white/55">
                    Required for student accounts. Other roles can leave this blank.
                  </p>
                )}
              </div>
            )}

            {roleNeedsStudentIdentity && (
              <div>
                <label htmlFor="southAfricanId" className="block text-sm text-white/80">
                  South African ID
                </label>
                <input
                  id="southAfricanId"
                  name="southAfricanId"
                  type="text"
                  inputMode="numeric"
                  className="mt-2 w-full rounded-lg bg-black/25 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/50"
                  placeholder="13-digit ID number"
                  value={southAfricanId}
                  onChange={(e) => setSouthAfricanId(e.target.value)}
                  autoComplete="off"
                  required
                  disabled={busy}
                />
              </div>
            )}

            {mode === "register" && (
              <div>
                <label htmlFor="role" className="block text-sm text-white/80">
                  Role
                </label>
                <select
                  id="role"
                  name="role"
                  className="mt-2 w-full rounded-lg bg-black/25 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/50"
                  value={role}
                  onChange={(e) => {
                    const nextRole = e.target.value as UserRole;
                    setRole(nextRole);
                    if (nextRole !== "ADMIN" && nextRole !== "LECTURER") {
                      setStaffRegisterPassword("");
                    }
                    if (nextRole !== "STUDENT") {
                      setSouthAfricanId("");
                    }
                  }}
                  disabled={busy}
                >
                  <option value="STUDENT">Student</option>
                  <option value="PARENT">Parent</option>
                  <option value="LECTURER">Lecturer</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <p className="mt-2 text-xs text-white/55">
                  Student and Parent can self-register. Admin/Lecturer require a staff registration password.
                </p>
              </div>
            )}

            {mode === "register" && roleNeedsStaffPassword && (
              <div>
                <label htmlFor="staffRegisterPassword" className="block text-sm text-white/80">
                  Staff Registration Password
                </label>
                <input
                  id="staffRegisterPassword"
                  name="staffRegisterPassword"
                  type="password"
                  className="mt-2 w-full rounded-lg bg-black/25 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/50"
                  placeholder="Enter staff password"
                  value={staffRegisterPassword}
                  onChange={(e) => setStaffRegisterPassword(e.target.value)}
                  autoComplete="off"
                  disabled={busy}
                />
              </div>
            )}

            {mode === "register" && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm text-white/80">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirm-password"
                  type="password"
                  className="mt-2 w-full rounded-lg bg-black/25 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/50"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  disabled={busy}
                />
              </div>
            )}

            <div>
              <label htmlFor="otp" className="block text-sm text-white/80">
                OTP Code
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  className="w-full rounded-lg bg-black/25 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/50"
                  placeholder="6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  disabled={!canRequestOtp}
                  onClick={() => requestOtp(mode === "login" ? "LOGIN" : "REGISTER")}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition disabled:opacity-50"
                >
                  Request OTP
                </button>
              </div>
              <p className="mt-2 text-xs text-white/55">
                Login can be submitted without OTP. If the backend requires OTP, request one, then retry.
              </p>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-lg py-3 font-semibold transition
                         bg-gradient-to-r from-cyan-400/90 to-purple-500/90
                         hover:from-cyan-300 hover:to-purple-400
                         shadow-[0_10px_30px_rgba(34,211,238,0.18)]
                         hover:shadow-[0_12px_40px_rgba(34,211,238,0.26)]
                         disabled:opacity-50"
            >
              {busy ? "Please wait..." : mode === "login" ? "Sign In" : "Create account"}
            </button>

            <p className="text-xs text-white/55 text-center">Backend: {API_BASE}</p>
          </form>
        </div>
      </div>
    </div>
  );
}
