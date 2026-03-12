// src/pages/Login-Page2.tsx
// Real authentication page.
// Supports:
// - Login
// - Registration
// - OTP requests
// - Student-specific fields
// - Role-aware registration rules
//
// Styling updated for the light minimal theme with:
// - full-page purple + teal halo background
// - white login card
// - purple shadow border
// - existing shared button styling retained

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

const API_PRIMARY = String(import.meta.env.VITE_API_URL ?? "")
  .trim()
  .replace(/\/+$/, "");
const API_SECONDARY = String(import.meta.env.VITE_API_URL_SECONDARY ?? "")
  .trim()
  .replace(/\/+$/, "");
const API_TARGET = String(import.meta.env.VITE_API_TARGET ?? "")
  .trim()
  .toLowerCase();
const API_BASE =
  API_TARGET === "secondary" && API_SECONDARY ? API_SECONDARY : API_PRIMARY;
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
    if (typeof nestedCode === "string" && nestedCode.trim()) {
      return nestedCode.trim().toUpperCase();
    }
  }
  return "";
}

function isOtpRequiredLoginError(error: HttpError, otpCode: string): boolean {
  if (otpCode.trim()) return false;

  const status = Number(error?.status ?? 0);
  if (![400, 401].includes(status)) return false;

  const msg = String(error?.message ?? "").toLowerCase();
  const code = extractErrorCode(error?.raw);

  if (
    msg.includes("otp required") ||
    msg.includes("otp") ||
    code === "OTP_REQUIRED"
  ) {
    return true;
  }

  if (status === 400 && code === "VALIDATION" && msg.includes("missing fields")) {
    return true;
  }

  return false;
}

function loginErrorBanner(error: HttpError, otpCode: string): string {
  if (isOtpRequiredLoginError(error, otpCode)) {
    return "OTP required for this environment. Request OTP, then retry.";
  }

  const status = Number(error?.status ?? 0);
  if (status === 401) {
    return "Invalid credentials. Check email/password and student number for student accounts.";
  }
  if (status === 403) {
    return "Access denied for this account in the current environment.";
  }
  if (status === 429) {
    return "Too many login attempts. Please wait a minute and retry.";
  }

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
  const [role, setRole] = useState<UserRole>("STUDENT");
  const [staffRegisterPassword, setStaffRegisterPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = useMemo(
    () => (mode === "login" ? "Sign in" : "Create your account"),
    [mode]
  );

  const roleNeedsStaffPassword =
    mode === "register" && (role === "ADMIN" || role === "LECTURER");
  const roleNeedsStudentIdentity =
    mode === "register" && role === "STUDENT";

  async function fetchMe(token: string) {
    return fetchAuthMe(token);
  }

  async function requestOtp(purpose: "LOGIN" | "REGISTER") {
    const eNorm = email.trim().toLowerCase();
    if (!eNorm) throw new Error("Please enter an email first.");

    setError(null);
    setInfo(null);

    const data = await requestOtpApi({ email: eNorm, purpose });
    const devOtp = String(data?.devOtp ?? data?.devCode ?? "").trim();

    if (devOtp) {
      setOtp(devOtp);
      setInfo(`OTP generated and auto-filled. Expires: ${data.expiresAt ?? "soon"}`);
    } else {
      setInfo("OTP requested. Check backend terminal in dev or email in production.");
    }
  }

  async function doLogin(
    eNorm: string,
    pw: string,
    otpCode: string,
    studentNumberInput: string
  ) {
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

    if (!data?.token) {
      throw new Error("Login succeeded but no token was returned.");
    }

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
    if (!password || password.length < 6) {
      return setError("Password must be at least 6 characters.");
    }

    if (mode === "register" && password !== confirmPassword) {
      return setError("Passwords do not match.");
    }

    if (roleNeedsStaffPassword && !staffRegisterPassword.trim()) {
      return setError(
        "Staff registration password is required for Admin and Lecturer roles."
      );
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
      return setError(
        "OTP is required for registration. Request OTP first, then enter the code."
      );
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
      (!!normalizeStudentNumber(studentNumber) &&
        /^\d{13}$/.test(normalizeSouthAfricanId(southAfricanId))));

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-220px)] w-full max-w-7xl items-center justify-center overflow-hidden px-4 py-10 md:py-14">
      {/* Full-page halo background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[6%] h-[24rem] w-[24rem] rounded-full bg-[#794DFA]/20 blur-3xl" />
        <div className="absolute right-[-8%] top-[10%] h-[22rem] w-[22rem] rounded-full bg-[#4EC2F3]/18 blur-3xl" />
        <div className="absolute bottom-[-6%] left-[20%] h-[20rem] w-[20rem] rounded-full bg-[#70ECE4]/16 blur-3xl" />
        <div className="absolute bottom-[0%] right-[18%] h-[18rem] w-[18rem] rounded-full bg-[#6C44FD]/14 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-md">
        {/* Main card */}
        <div
          className="relative overflow-hidden rounded-[28px] border border-[#d7ccff] bg-white p-8 shadow-[0_0_0_1px_rgba(121,77,250,0.08),0_18px_50px_rgba(108,68,253,0.18)] md:p-9"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#794DFA]/30 to-transparent" />
            <div className="absolute -left-8 top-0 h-28 w-28 rounded-full bg-[#4EC2F3]/10 blur-2xl" />
            <div className="absolute -right-8 top-10 h-28 w-28 rounded-full bg-[#794DFA]/10 blur-2xl" />
          </div>

          <div className="relative">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-[2.1rem]">
              <span className="bg-gradient-to-r from-[#4EC2F3] via-[#70ECE4] to-[#794DFA] bg-clip-text text-transparent">
                Forge Communicator
              </span>
            </h1>


            {/* Mode switch */}
            <div className="mt-6 grid grid-cols-2 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-1">
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
                  "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                  mode === "login"
                    ? "bg-white text-slate-900 shadow-sm border border-[#e5e7eb]"
                    : "text-slate-600 hover:bg-white/70",
                ].join(" ")}
                title="Switch to login mode"
                aria-label="Switch to login mode"
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
                  "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                  mode === "register"
                    ? "bg-white text-slate-900 shadow-sm border border-[#e5e7eb]"
                    : "text-slate-600 hover:bg-white/70",
                ].join(" ")}
                title="Switch to register mode"
                aria-label="Switch to register mode"
              >
                Register
              </button>
            </div>

            <h2 className="mt-6 text-xl font-semibold text-slate-900">{title}</h2>

            {info && (
              <div className="mt-4 rounded-xl border border-[#bfeaf3] bg-[#eefbfd] p-3 text-sm text-slate-800">
                {info}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {ENV_CONFIG_ERROR && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {ENV_CONFIG_ERROR}
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-5 space-y-4" autoComplete="on">
              <div>
                <label htmlFor="email" className="block text-sm text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  name="username"
                  type="email"
                  className="mt-2 w-full rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  disabled={busy}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  name={mode === "login" ? "current-password" : "new-password"}
                  type="password"
                  className="mt-2 w-full rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  disabled={busy}
                />
              </div>

              {(mode === "login" || roleNeedsStudentIdentity) && (
                <div>
                  <label
                    htmlFor="studentNumber"
                    className="block text-sm text-slate-700"
                  >
                    Student Number
                  </label>
                  <input
                    id="studentNumber"
                    name="studentNumber"
                    type="text"
                    className="mt-2 w-full rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
                    placeholder="e.g. STU-1001"
                    value={studentNumber}
                    onChange={(e) => setStudentNumber(e.target.value)}
                    autoComplete="off"
                    required={roleNeedsStudentIdentity}
                    disabled={busy}
                  />
                  {mode === "login" && (
                    <p className="mt-2 text-xs text-slate-500">
                      Required for student accounts. Other roles can leave this blank.
                    </p>
                  )}
                </div>
              )}

              {roleNeedsStudentIdentity && (
                <div>
                  <label
                    htmlFor="southAfricanId"
                    className="block text-sm text-slate-700"
                  >
                    South African ID
                  </label>
                  <input
                    id="southAfricanId"
                    name="southAfricanId"
                    type="text"
                    inputMode="numeric"
                    className="mt-2 w-full rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
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
                  <label htmlFor="role" className="block text-sm text-slate-700">
                    Role
                  </label>
                  <select
                    id="role"
                    name="role"
                    className="mt-2 w-full rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
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
                  <p className="mt-2 text-xs text-slate-500">
                    Student and Parent can self-register. Admin and Lecturer require a staff registration password.
                  </p>
                </div>
              )}

              {mode === "register" && roleNeedsStaffPassword && (
                <div>
                  <label
                    htmlFor="staffRegisterPassword"
                    className="block text-sm text-slate-700"
                  >
                    Staff Registration Password
                  </label>
                  <input
                    id="staffRegisterPassword"
                    name="staffRegisterPassword"
                    type="password"
                    className="mt-2 w-full rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
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
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm text-slate-700"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirm-password"
                    type="password"
                    className="mt-2 w-full rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
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
                <label htmlFor="otp" className="block text-sm text-slate-700">
                  OTP Code
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    className="w-full rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
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
                    className="btn-secondary shrink-0"
                    title="Request one-time password"
                    aria-label="Request one-time password"
                  >
                    Request OTP
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="btn-primary w-full"
                title={mode === "login" ? "Sign in" : "Create account"}
                aria-label={mode === "login" ? "Sign in" : "Create account"}
              >
                {busy
                  ? "Please wait..."
                  : mode === "login"
                  ? "Sign In"
                  : "Create account"}
              </button>

            <p className="hidden">
              Environment Debug: backend={API_BASE || "MISSING"} | build=
              {IS_PROD_BUILD ? "production" : "development"}
            </p>
            
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}