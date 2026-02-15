// src/pages/Login-Page2.tsx
// DEV AUTH ONLY (no backend, no OTP).
// - Login: email + password + role (demo UI)
// - Register: email + password + confirm + role (demo UI)
// Stores a fake token + user in localStorage so RequireAuth routing works.

import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { setAuth, type UserRole } from "../lib/auth";

type LocationState = {
  from?: string;
};

type Mode = "login" | "register";

function randomId() {
  return `u-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

function landingFor(role: UserRole) {
  return role === "PARENT" ? "/app/parent" : "/app";
}

export default function LoginPage2() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from;

  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [role, setRole] = useState<UserRole>("STUDENT");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);

  const title = useMemo(
    () => (mode === "login" ? "Sign in" : "Create your account"),
    [mode]
  );

  function devAuthSuccess(selectedRole: UserRole, overrideEmail?: string) {
    const eNorm = (overrideEmail ?? email).trim().toLowerCase();

    setAuth(`dev-token-${Date.now()}`, {
      id: randomId(),
      email: eNorm,
      role: selectedRole,
    });

    const dest = from ?? landingFor(selectedRole);
    navigate(dest, { replace: true });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const eNorm = email.trim().toLowerCase();
    if (!eNorm) {
      setError("Please enter an email.");
      return;
    }

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (mode === "register") {
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    devAuthSuccess(role);
  }

  function demoLogin(r: UserRole) {
    const demoEmail =
      r === "PARENT"
        ? "parent@demo.com"
        : r === "LECTURER"
        ? "lecturer@demo.com"
        : r === "ADMIN"
        ? "admin@demo.com"
        : "student@demo.com";

    setEmail(demoEmail);
    setPassword("password123");
    setRole(r);

    devAuthSuccess(r, demoEmail);
  }

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
            Dev auth UI (no backend, no OTP). Stable pre-OTP login.
          </p>

          {/* Mode toggle */}
          <div className="mt-6 grid grid-cols-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
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

          {/* Demo shortcuts */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => demoLogin("STUDENT")}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
            >
              Demo Student
            </button>
            <button
              type="button"
              onClick={() => demoLogin("PARENT")}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
            >
              Demo Parent
            </button>
            <button
              type="button"
              onClick={() => demoLogin("LECTURER")}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
            >
              Demo Lecturer
            </button>
            <button
              type="button"
              onClick={() => demoLogin("ADMIN")}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
            >
              Demo Admin
            </button>
          </div>

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
              />
            </div>

            {/* IMPORTANT: render password field with STATIC autoComplete values
                so Edge Tools / Axe stops complaining. */}
            {mode === "login" ? (
              <div>
                <label htmlFor="password" className="block text-sm text-white/80">
                  Password
                </label>
                <input
                  id="password"
                  name="current-password"
                  type="password"
                  className="mt-2 w-full rounded-lg bg-black/25 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/50"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="current-password"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="password" className="block text-sm text-white/80">
                  Password
                </label>
                <input
                  id="password"
                  name="new-password"
                  type="password"
                  className="mt-2 w-full rounded-lg bg-black/25 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/50"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
            )}

            <div>
              <label htmlFor="role" className="block text-sm text-white/80">
                Role (dev)
              </label>
              <select
                id="role"
                name="role"
                title="Role (dev)"
                className="mt-2 w-full rounded-lg bg-black/25 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/50"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                <option value="STUDENT">Student</option>
                <option value="PARENT">Parent</option>
                <option value="LECTURER">Lecturer</option>
                <option value="ADMIN">Admin</option>
              </select>

              <p className="mt-2 text-xs text-white/55">
                Dev-only: backend will enforce roles later.
              </p>
            </div>

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
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-lg py-3 font-semibold transition
                         bg-gradient-to-r from-cyan-400/90 to-purple-500/90
                         hover:from-cyan-300 hover:to-purple-400
                         shadow-[0_10px_30px_rgba(34,211,238,0.18)]
                         hover:shadow-[0_12px_40px_rgba(34,211,238,0.26)]"
            >
              {mode === "login" ? "Sign In" : "Create account"}
            </button>

            <p className="text-xs text-white/55 text-center">
              Dev auth stores a fake token locally so protected routing works.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
