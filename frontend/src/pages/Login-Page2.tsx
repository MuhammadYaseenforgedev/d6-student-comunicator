// src/pages/Login-Page2.tsx
// REAL AUTH (backend + JWT + OTP).
// Flow:
// 1) Request OTP: POST /auth/request-otp (fallback /api/auth/request-otp)
// 2) Register: POST /auth/register (fallback /api/auth/register) with otp
// 3) Login: POST /auth/login (fallback /api/auth/login) with otp
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

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

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

  // backend expects role on register
  const [role, setRole] = useState<UserRole>("STUDENT");
  const [staffRegisterPassword, setStaffRegisterPassword] = useState("");

  // OTP is REQUIRED by backend for both login and register
  const [otp, setOtp] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = useMemo(() => (mode === "login" ? "Sign in" : "Create your account"), [mode]);
  const roleNeedsStaffPassword = mode === "register" && (role === "ADMIN" || role === "LECTURER");

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

  async function doLogin(eNorm: string, pw: string, otpCode: string) {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: eNorm, password: pw, otp: otpCode }),
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
    staffPassword: string
  ) {
    const payload: {
      email: string;
      password: string;
      role: UserRole;
      otp: string;
      staffRegisterPassword?: string;
    } = {
      email: eNorm,
      password: pw,
      role: selectedRole,
      otp: otpCode,
    };

    if (selectedRole === "ADMIN" || selectedRole === "LECTURER") {
      payload.staffRegisterPassword = staffPassword;
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
    if (!eNorm) return setError("Please enter an email.");

    if (!password || password.length < 6) return setError("Password must be at least 6 characters.");

    if (mode === "register" && password !== confirmPassword) {
      return setError("Passwords do not match.");
    }

    if (roleNeedsStaffPassword && !staffRegisterPassword.trim()) {
      return setError("Staff registration password is required for Admin/Lecturer roles.");
    }

    if (!otp.trim()) {
      return setError("OTP is required. Click 'Request OTP' first, then enter the code.");
    }

    try {
      setBusy(true);
      if (mode === "login") {
        await doLogin(eNorm, password, otp.trim());
      } else {
        await doRegister(eNorm, password, otp.trim(), role, staffRegisterPassword.trim());
      }
    } catch (err) {
      const e2 = err as HttpError;
      setError(e2?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const canRequestOtp = !!email.trim() && !busy;
  const canSubmit = !!otp.trim() && !busy && (!roleNeedsStaffPassword || !!staffRegisterPassword.trim());

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
                In dev, OTP prints in backend terminal. If OTP_RETURN_DEV_CODE=true, it auto-fills here.
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
