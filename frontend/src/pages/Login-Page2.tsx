// src/pages/Login-Page2.tsx
// REAL AUTH (backend + JWT + OTP).
// Flow:
// 1) Request OTP: POST /api/auth/request-otp
// 2) Register: POST /api/auth/register with otp
//    - STUDENT requires southAfricanId + studentNumber
// 3) Login: POST /api/auth/login with password + otp in production
//    - STUDENT requires studentNumber
//
// Styling updated for the neon glass theme with:
// - dark glass login card
// - neon halo background
// - Forge logo image in place of title text
// - shared neon input/button styling

import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  consumeLogoutNotice,
  setAuth,
  type AuthUser,
  type UserRole,
} from "../lib/auth";
import { type ApiClientError } from "../lib/apiClient";
import {
  fetchAuthMe,
  login as loginApi,
  register as registerApi,
  requestOtp as requestOtpApi,
} from "../lib/authService";
import { isFinanceAdmin } from "../lib/adminAccess";
import forgeLogo from "../assets/Forge.jpg";
import AuthAssistant from "../components/AuthAssistant";
import OTPInput from "../components/OTPInput";

type LocationState = { from?: string };
type Mode = "login" | "register";
type OtpPurpose = "LOGIN" | "REGISTER";
type LoginPage2Props = { onOpenLegal?: () => void };
const PUBLIC_REGISTRATION_ROLES: UserRole[] = ["STUDENT", "PARENT"];
const LOGIN_QUICK_ACCESS_LINKS = [
  {
    label: "Clock In",
    href: "https://pulse.forgetalent.co.za/",
  },
  {
    label: "Send a Ticket",
    href: "https://pulse.forgetalent.co.za/ticket.php",
  },
] as const;
const DEMO_LOGIN_ACCOUNTS = [
  {
    label: "Student",
    email: "demo.student@d6.local",
    role: "STUDENT",
    adminScope: null,
    studentNumber: "20231771",
    firstName: "Thabo",
    lastName: "Maseko",
    courseName: "Demo Computer Science Course",
  },
  {
    label: "Lecturer",
    email: "demo.lecturer@d6.local",
    role: "LECTURER",
    adminScope: null,
    studentNumber: "",
    firstName: "Lerato",
    lastName: "Dlamini",
    courseName: null,
  },
  {
    label: "Parent",
    email: "demo.parent@d6.local",
    role: "PARENT",
    adminScope: null,
    studentNumber: "",
    firstName: "Naledi",
    lastName: "Maseko",
    courseName: null,
  },
  {
    label: "Admin",
    email: "demo.academic.admin@d6.local",
    role: "ADMIN",
    adminScope: "ACADEMIC",
    studentNumber: "",
    firstName: "Amina",
    lastName: "Nkosi",
    courseName: null,
  },
  {
    label: "Finance",
    email: "demo.finance.admin@d6.local",
    role: "ADMIN",
    adminScope: "FINANCE",
    studentNumber: "",
    firstName: "Farah",
    lastName: "Mokoena",
    courseName: null,
  },
  {
    label: "Super",
    email: "demo.super.admin@d6.local",
    role: "ADMIN",
    adminScope: "SUPER",
    studentNumber: "",
    firstName: "Simon",
    lastName: "Naidoo",
    courseName: null,
  },
] satisfies readonly {
  label: string;
  email: string;
  role: UserRole;
  adminScope: AuthUser["adminScope"];
  studentNumber: string;
  firstName: string;
  lastName: string;
  courseName: string | null;
}[];

function landingFor(user: Pick<AuthUser, "role" | "adminScope">) {
  if (user.role === "STUDENT") return "/app/personal-details";
  if (user.role === "PARENT") return "/app/parent";
  if (isFinanceAdmin(user)) return "/app/admin/finance";
  return "/app";
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
const SHOW_DEMO_LOGIN = Boolean(import.meta.env.DEV);
const LOGIN_REQUIRES_OTP = IS_PROD_BUILD;
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

  if (
    status === 400 &&
    code === "VALIDATION" &&
    msg.includes("missing fields")
  ) {
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

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

function normalizeSouthAfricanId(v: string): string {
  return v.replace(/\D+/g, "");
}

export default function LoginPage2({ onOpenLegal }: LoginPage2Props) {
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
  const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false);
  const [lastOtpRequest, setLastOtpRequest] = useState<{
    email: string;
    purpose: OtpPurpose;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(() => consumeLogoutNotice() ?? null);
  const [busy, setBusy] = useState(false);

  const title = useMemo(
    () => (mode === "login" ? "Sign in" : "Create your account"),
    [mode]
  );

  const roleNeedsStaffPassword =
    mode === "register" && (role === "ADMIN" || role === "LECTURER");
  const roleNeedsStudentIdentity =
    mode === "register" && role === "STUDENT";

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    setInfo(null);
    setOtp("");
    setStaffRegisterPassword("");
    setSouthAfricanId("");
    setAcceptedLegalTerms(false);
    if (nextMode === "register" && !PUBLIC_REGISTRATION_ROLES.includes(role)) {
      setRole("STUDENT");
    }
  }

  async function fetchMe(token: string) {
    return fetchAuthMe(token);
  }

  async function requestOtp(purpose: OtpPurpose) {
    const eNorm = normalizeEmail(email);
    if (!eNorm) throw new Error("Please enter an email first.");

    setError(null);
    setInfo(null);

    const data = await requestOtpApi({ email: eNorm, purpose });
    const devOtp = String(data?.devOtp ?? data?.devCode ?? "").trim();
    const emailDeliveryEnabled = data?.emailDeliveryEnabled;
    const purposeLabel = purpose === "REGISTER" ? "Registration" : "Sign-in";

    setLastOtpRequest({ email: eNorm, purpose });

    if (devOtp) {
      setOtp(devOtp);
      setInfo(
        `${purposeLabel} OTP generated and auto-filled. Expires: ${data.expiresAt ?? "soon"}`
      );
    } else if (emailDeliveryEnabled === false) {
      setInfo(
        `${purposeLabel} OTP created, but email delivery is not configured on this server.`
      );
    } else {
      setInfo(
        purpose === "LOGIN"
          ? `${purposeLabel} OTP requested. If an account exists for this email, check your inbox and spam folder.`
          : `${purposeLabel} OTP request sent. Please check email.`
      );
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

    const dest = from ?? landingFor(user);
    navigate(dest, { replace: true });
  }

  async function doRegister(
    eNorm: string,
    pw: string,
    otpCode: string,
    selectedRole: UserRole,
    staffPassword: string,
    studentNumberInput: string,
    southAfricanIdInput: string,
    legalTermsAccepted: boolean
  ) {
    const payload: {
      email: string;
      password: string;
      role: UserRole;
      otp: string;
      acceptedLegalTerms: boolean;
      staffRegisterPassword?: string;
      studentNumber?: string;
      southAfricanId?: string;
    } = {
      email: eNorm,
      password: pw,
      role: selectedRole,
      otp: otpCode,
      acceptedLegalTerms: legalTermsAccepted,
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

      const dest = from ?? landingFor(user);
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

    const eNorm = normalizeEmail(email);
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

    if (mode === "register" && !acceptedLegalTerms) {
      return setError(
        "You must accept the POPIA Disclosure and IT Terms of Use before registering."
      );
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

    if (mode === "register" && otp.trim().length !== 6) {
      return setError(
        "OTP is required for registration. Request OTP first, then enter the code."
      );
    }
    if (mode === "login" && LOGIN_REQUIRES_OTP && otp.trim().length !== 6) {
      return setError(
        "Please enter the full 6-digit OTP"
      );
    }

    if (otp.trim().length === 6 && lastOtpRequest) {
      const expectedPurpose: OtpPurpose =
        mode === "register" ? "REGISTER" : "LOGIN";

      if (
        lastOtpRequest.email !== eNorm ||
        lastOtpRequest.purpose !== expectedPurpose
      ) {
        return setError(
          expectedPurpose === "REGISTER"
            ? "Request a registration OTP for this email before creating your account."
            : "Request a sign-in OTP for this email before signing in."
        );
      }
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
          southAfricanIdNorm,
          acceptedLegalTerms
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

  function onDemoLogin(account: (typeof DEMO_LOGIN_ACCOUNTS)[number]) {
    setError(null);
    setInfo(null);
    setMode("login");
    setEmail(account.email);
    setPassword("DemoPass123");
    setStudentNumber(account.studentNumber);
    setOtp("");
    setLastOtpRequest(null);

    const user: AuthUser = {
      id: `mock-demo-${account.role.toLowerCase()}-${account.adminScope ?? "user"}`,
      email: account.email,
      role: account.role,
      adminScope: account.adminScope,
      firstName: account.firstName,
      lastName: account.lastName,
      courseName: account.courseName,
    };

    setAuth(`mock-demo-token-${account.email}`, user);
    navigate(landingFor(user), { replace: true });
  }

  const canRequestOtp = !ENV_CONFIG_ERROR && !!email.trim() && !busy;
  const hasOtp = otp.trim().length === 6;
  const canSubmit =
    !ENV_CONFIG_ERROR &&
    ((mode === "login" && (!LOGIN_REQUIRES_OTP || hasOtp)) ||
      (mode === "register" && hasOtp)) &&
    !busy &&
    (mode !== "register" || acceptedLegalTerms) &&
    (!roleNeedsStaffPassword || !!staffRegisterPassword.trim()) &&
    (!roleNeedsStudentIdentity ||
      (!!normalizeStudentNumber(studentNumber) &&
        /^\d{13}$/.test(normalizeSouthAfricanId(southAfricanId))));

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-220px)] w-full max-w-7xl items-center justify-center overflow-hidden px-4 py-10 md:py-14">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[6%] h-[24rem] w-[24rem] rounded-full bg-[#8C5BFF]/18 blur-3xl" />
        <div className="absolute right-[-8%] top-[10%] h-[22rem] w-[22rem] rounded-full bg-[#4FA6FF]/14 blur-3xl" />
        <div className="absolute bottom-[-6%] left-[20%] h-[20rem] w-[20rem] rounded-full bg-[#8CEBFF]/12 blur-3xl" />
        <div className="absolute bottom-[0%] right-[18%] h-[18rem] w-[18rem] rounded-full bg-[#FF5EDB]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-md">
        <div className="auth-gradient-shell p-8 md:p-9">
          <div className="sidebar-gradient-border-overlay absolute inset-0" />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8CEBFF]/40 to-transparent" />
            <div className="absolute -left-8 top-0 h-28 w-28 rounded-full bg-[#8CEBFF]/10 blur-2xl" />
            <div className="absolute -right-8 top-10 h-28 w-28 rounded-full bg-[#8C5BFF]/10 blur-2xl" />
          </div>

          <div className="relative">
            <div className="flex justify-center">
              <img
                src={forgeLogo}
                alt="Forge"
                className="h-20 w-auto object-contain md:h-24"
              />
            </div>

            <div className="auth-nav-shell mt-6">
              <button
                type="button"
                onClick={() => {
                  changeMode("login");
                }}
                className={[
                  "auth-nav-tab",
                  mode === "login"
                    ? "auth-nav-tab-active"
                    : "auth-nav-tab-idle",
                ].join(" ")}
                title="Switch to login mode"
                aria-label="Switch to login mode"
                aria-pressed={mode === "login"}
              >
                Login
              </button>

              <button
                type="button"
                onClick={() => {
                  changeMode("register");
                }}
                className={[
                  "auth-nav-tab",
                  mode === "register"
                    ? "auth-nav-tab-active"
                    : "auth-nav-tab-idle",
                ].join(" ")}
                title="Switch to register mode"
                aria-label="Switch to register mode"
                aria-pressed={mode === "register"}
              >
                Register
              </button>
            </div>

            <h2 className="mt-6 text-xl font-semibold text-white">{title}</h2>

            {info && <div className="info-banner mt-4">{info}</div>}

            {error && <div className="error-banner mt-4">{error}</div>}

            {ENV_CONFIG_ERROR && (
              <div className="error-banner mt-4">{ENV_CONFIG_ERROR}</div>
            )}

            <form
              onSubmit={onSubmit}
              className="mt-5 space-y-4"
              autoComplete="on"
            >
              {mode === "register" && (
                <div>
                  <label htmlFor="role" className="block text-sm text-white/80">
                    Role
                  </label>
                  <select
                    id="role"
                    name="role"
                    className="select-glass mt-2"
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
                    {PUBLIC_REGISTRATION_ROLES.map((allowedRole) => (
                      <option key={allowedRole} value={allowedRole}>
                        {allowedRole === "STUDENT" ? "Student" : "Parent"}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-white/55">
                    Staff and admin accounts are created from the protected admin account flow.
                  </p>
                </div>
              )}

              {roleNeedsStudentIdentity && (
                <div>
                  <label
                    htmlFor="southAfricanId"
                    className="block text-sm text-white/80"
                  >
                    South African ID
                  </label>
                  <input
                    id="southAfricanId"
                    name="southAfricanId"
                    type="text"
                    inputMode="numeric"
                    className="input-glass mt-2"
                    placeholder="13-digit ID number"
                    value={southAfricanId}
                    onChange={(e) => setSouthAfricanId(e.target.value)}
                    autoComplete="off"
                    required
                    disabled={busy}
                  />
                </div>
              )}

              {(mode === "login" || roleNeedsStudentIdentity) && (
                <div>
                  <label
                    htmlFor="studentNumber"
                    className="block text-sm text-white/80"
                  >
                    Student Number
                  </label>
                  <input
                    id="studentNumber"
                    name="studentNumber"
                    type="text"
                    className="input-glass mt-2"
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

              <div>
                <label htmlFor="email" className="block text-sm text-white/80">
                  Email
                </label>
                <input
                  id="email"
                  name="username"
                  type="email"
                  className="input-glass mt-2"
                  placeholder="name@example.com"
                  value={email}
                      onChange={(e) => {
                        const nextEmail = e.target.value;
                        const nextEmailNorm = normalizeEmail(nextEmail);
                        setEmail(nextEmail);

                        if (lastOtpRequest && lastOtpRequest.email !== nextEmailNorm) {
                          setLastOtpRequest(null);
                          setOtp("");
                          setInfo(null);
                        }
                      }}
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
                  className="input-glass mt-2"
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

              {mode === "register" && (
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm text-white/80"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirm-password"
                    type="password"
                    className="input-glass mt-2"
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
                <div className="mt-2 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    disabled={!canRequestOtp}
                    onClick={() => {
                      void onRequestOtpClick();
                    }}
                    className="btn-secondary shrink-0 px-4 py-2.5"
                    title="Request one-time password"
                    aria-label="Request one-time password"
                  >
                    Request OTP
                  </button>

                  <div className="w-full overflow-x-auto">
                    <div className="flex min-w-max justify-center">
                      <OTPInput
                        id="otp"
                        name="otp"
                        value={otp}
                        onChange={setOtp}
                        length={6}
                        disabled={busy}
                      />
                    </div>
                  </div>
                </div>

                {mode === "login" ? (
                  <p className="mt-2 text-xs text-white/55">
                    {LOGIN_REQUIRES_OTP
                      ? "Production sign-in requires password + OTP. Request OTP, then enter the 6-digit code."
                      : "Request OTP if this environment requires it."}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-white/55">
                    Registration requires OTP. Request OTP, then enter the 6-digit code.
                  </p>
                )}
              </div>

              {mode === "register" && roleNeedsStaffPassword && (
                <div>
                  <label
                    htmlFor="staffRegisterPassword"
                    className="block text-sm text-white/80"
                  >
                    Staff Registration Password
                  </label>
                  <input
                    id="staffRegisterPassword"
                    name="staffRegisterPassword"
                    type="password"
                    className="input-glass mt-2"
                    placeholder="Enter staff password"
                    value={staffRegisterPassword}
                    onChange={(e) => setStaffRegisterPassword(e.target.value)}
                    autoComplete="off"
                    disabled={busy}
                  />
                </div>
              )}

              {mode === "register" && (
                <div className="rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.52)] px-4 py-3">
                  <label
                    htmlFor="acceptedLegalTerms"
                    className="flex cursor-pointer items-start gap-3 text-sm text-white/82"
                  >
                    <input
                      id="acceptedLegalTerms"
                      name="acceptedLegalTerms"
                      type="checkbox"
                      checked={acceptedLegalTerms}
                      onChange={(e) => setAcceptedLegalTerms(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-[rgba(140,235,255,0.28)] bg-[rgba(8,18,48,0.84)] text-[#8CEBFF] focus:ring-[#8CEBFF]/40"
                      disabled={busy}
                    />
                    <span>
                      I have read and agree to the{" "}
                      <button
                        type="button"
                        onClick={onOpenLegal}
                        className="font-medium text-[#8CEBFF] transition hover:text-white focus:outline-none focus:text-white"
                      >
                        POPIA Disclosure
                      </button>{" "}
                      and{" "}
                      <button
                        type="button"
                        onClick={onOpenLegal}
                        className="font-medium text-[#8CEBFF] transition hover:text-white focus:outline-none focus:text-white"
                      >
                        IT Terms of Use
                      </button>
                      .
                    </span>
                  </label>
                </div>
              )}

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

              {mode === "login" && (
                <p className="text-center text-xs text-white/55">
                  By logging in, you agree to the Forge Communicator{" "}
                  <button
                    type="button"
                    onClick={onOpenLegal}
                    className="text-[#8CEBFF] transition hover:text-white focus:outline-none focus:text-white"
                  >
                    IT Terms of Use
                  </button>
                  .
                </p>
              )}

            </form>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {LOGIN_QUICK_ACCESS_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-[rgba(140,235,255,0.28)] bg-[rgba(9,19,50,0.78)] px-4 py-3 text-sm font-semibold text-[#8CEBFF] shadow-[0_8px_18px_rgba(3,10,28,0.28)] [text-shadow:0_0_14px_rgba(140,235,255,0.45)] transition-all duration-200 hover:-translate-y-px hover:border-[rgba(140,235,255,0.42)] hover:bg-[rgba(15,31,78,0.88)] hover:text-[#BDF5FF] hover:[text-shadow:0_0_18px_rgba(140,235,255,0.6)] hover:shadow-[0_10px_22px_rgba(3,10,28,0.34)]"
                  >
                    {link.label}
                  </a>
                ))}
            </div>

            {SHOW_DEMO_LOGIN && (
              <div className="mt-5 rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.52)] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                  Demo access
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {DEMO_LOGIN_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      disabled={busy || Boolean(ENV_CONFIG_ERROR)}
                      onClick={() => {
                        onDemoLogin(account);
                      }}
                      className="rounded-xl border border-[rgba(140,235,255,0.24)] bg-[rgba(9,19,50,0.78)] px-3 py-2 text-xs font-semibold text-[#8CEBFF] transition hover:border-[rgba(140,235,255,0.42)] hover:bg-[rgba(15,31,78,0.88)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {account.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AuthAssistant
        mode={mode}
        role={role}
        canRequestOtp={canRequestOtp}
        onSwitchMode={changeMode}
        onRequestOtp={onRequestOtpClick}
      />
    </div>
  );
}
