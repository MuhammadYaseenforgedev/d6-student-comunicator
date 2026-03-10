// src/pages/Login-Page2.tsx
// REAL AUTH (backend + JWT + OTP).
// Flow:
// 1) Request OTP: POST /api/auth/request-otp
// 2) Register: POST /api/auth/register with otp
//    - STUDENT requires southAfricanId + studentNumber
// 3) Login: POST /api/auth/login with optional otp
//    - STUDENT requires studentNumber
//
// Stores token + user in localStorage via setAuth so RequireAuth routing works.

import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { setAuth, type UserRole } from "../lib/auth";
import { type ApiClientError } from "../lib/apiClient";
import {
  fetchAuthMe,
  login as loginApi,
  register as registerApi,
  requestOtp as requestOtpApi,
} from "../lib/authService";

type LocationState = { from?: string };
type Mode = "login" | "register";

function landingFor(role: UserRole) {
  return role === "PARENT" ? "/app/parent" : "/app";
}

const API_PRIMARY = String(import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
const API_SECONDARY = String(import.meta.env.VITE_API_URL_SECONDARY ?? "").trim().replace(/\/+$/, "");
const API_TARGET = String(import.meta.env.VITE_API_TARGET ?? "primary").trim().toLowerCase();
const API_BASE = API_TARGET === "secondary" && API_SECONDARY ? API_SECONDARY : API_PRIMARY;
const IS_PROD_BUILD = Boolean(import.meta.env.PROD);
const ENV_CONFIG_ERROR = !API_BASE
  ? "Environment misconfigured: VITE_API_URL is missing. Contact support."
  : null;

type HttpError = ApiClientError;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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
    return fetchAuthMe(token);
  }

  async function requestOtp(purpose: "LOGIN" | "REGISTER") {
    const eNorm = email.trim().toLowerCase();
    if (!eNorm) throw new Error("Please enter an email first.");

    // Clear old messages, keep user-entered otp until we get a devCode
    setError(null);
    setInfo(null);

    const data = await requestOtpApi({ email: eNorm, purpose });
    const devOtp = String(data?.devOtp ?? data?.devCode ?? data?.debugOtp ?? "").trim();

    if (devOtp) {
      setOtp(devOtp);
      setInfo(`OTP generated (auto-filled). Expires: ${data.expiresAt ?? "soon"}`);
    } else {
      setInfo("OTP requested. Check backend terminal for the OTP code (dev) or your email (prod).");
    }
  }

  async function doLogin(eNorm: string, pw: string, otpCode: string, studentNumberInput: string) {
    const payload: {
      email: string;
      password: string;
      otp?: string;
      studentNumber?: string;
    } = {
      email: eNorm,
      password: pw,
    };

    const studentNumberNorm = normalizeStudentNumber(studentNumberInput);
    if (studentNumberNorm) {
      payload.studentNumber = studentNumberNorm;
    }

    if (otpCode.trim()) {
      payload.otp = otpCode.trim();
    }

    const data = await loginApi(payload);

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

    const data = await registerApi(payload);

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
    if (ENV_CONFIG_ERROR) return setError(ENV_CONFIG_ERROR);
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

  async function onRequestOtpClick() {
    try {
      setBusy(true);
      await requestOtp(mode === "login" ? "LOGIN" : "REGISTER");
    } catch (err) {
      const e2 = err as HttpError;
      setError(e2?.message ?? "Failed to request OTP.");
    } finally {
      setBusy(false);
    }
  }

  const canRequestOtp = !ENV_CONFIG_ERROR && !!email.trim() && !busy;
  const canSubmit =
    !ENV_CONFIG_ERROR &&
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

          {ENV_CONFIG_ERROR && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {ENV_CONFIG_ERROR}
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
                  onClick={() => {
                    void onRequestOtpClick();
                  }}
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

            <p className="text-xs text-white/55 text-center">
              Environment Debug: backend={API_BASE || "MISSING"} | build={IS_PROD_BUILD ? "production" : "development"}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
