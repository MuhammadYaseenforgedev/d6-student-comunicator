// src/components/AppShell.tsx
// Main authenticated application shell.
// Responsibilities:
// - Render the global sidebar
// - Render the current page content via <Outlet />
// - Show role-aware navigation
// - Display logged-in user summary
// - Keep visual styling consistent with the app-wide neon glass theme

import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearAuth, getUser } from "../lib/auth";
import AppErrorBoundary from "./AppErrorBoundary";
import { fetchMeProfile, type MeProfile } from "../lib/authService";
import AnimatedForgeLogo from "./AnimatedForgeLogo";

function Item({
  to,
  label,
}: {
  to: string;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        ["nav-item", isActive ? "nav-item-active" : "nav-item-idle"].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}

export default function AppShell() {
  const navigate = useNavigate();
  const user = getUser();

  const isParent = user?.role === "PARENT";
  const isStudent = user?.role === "STUDENT";

  const calendarTo =
    user?.role === "PARENT" ? "/app/parent/calendar" : "/app/calendar";
  const homeTo = isParent ? "/app/parent" : "/app";

  const userId = user?.id ?? "";
  const userRole = user?.role ?? "";

  const [profile, setProfile] = useState<MeProfile | null>(null);

  useEffect(() => {
    if (userRole !== "STUDENT" || !userId) return;

    let cancelled = false;

    void fetchMeProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          console.error("[app-shell] failed to load /api/me profile", e);
          setProfile(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, userRole]);

  const studentDisplayName = useMemo(() => {
    if (!isStudent) return "";

    const first = profile?.firstName?.trim() ?? "";
    const last = profile?.lastName?.trim() ?? "";
    const combined = `${first} ${last}`.trim();

    if (combined) return combined;
    return user?.email ?? "Student";
  }, [isStudent, profile?.firstName, profile?.lastName, user?.email]);

  const studentCourse = useMemo(() => {
    if (!isStudent) return "";
    return profile?.courseName?.trim() || "Course not assigned";
  }, [isStudent, profile?.courseName]);

  function logout() {
    clearAuth();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-[calc(100vh-220px)]">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[290px_1fr]">
          {/* Sidebar */}
          <aside className="glass-panel-premium relative overflow-hidden p-4">
            <div className="pointer-events-none absolute inset-0 opacity-100">
              <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-[#8CEBFF]/12 blur-3xl" />
              <div className="absolute -bottom-16 -right-12 h-52 w-52 rounded-full bg-[#8C5BFF]/12 blur-3xl" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8CEBFF]/50 to-transparent" />
            </div>

            <div className="relative">
              <Link to={homeTo} className="block">
                <AnimatedForgeLogo />
              </Link>

              <div className="mt-6 space-y-1.5">
                <Item to={homeTo} label="Home" />

                {isParent ? (
                  <>
                    <div className="divider-soft my-3" />
                    <Item to="/app/parent" label="Overview" />
                    <Item to="/app/parent/results" label="Results" />
                    <Item to="/app/parent/finance" label="Finance" />
                    <Item to={calendarTo} label="Calendar" />
                    <Item to="/app/parent/attendance" label="Attendance" />
                    <Item to="/app/parent/children" label="Links" />
                    <Item to="/app/uploads" label="Uploads" />
                    <Item to="/app/messages" label="Messages" />
                  </>
                ) : (
                  <>
                    <Item to="/app/modules" label="Modules" />
                    <Item to="/app/faculty" label="Faculty" />
                    <Item to="/app/clubs" label="Clubs" />
                    <Item to="/app/emergency" label="Emergency" />

                    <div className="divider-soft my-3" />

                    <Item to="/app/uploads" label="Uploads" />
                    <Item to="/app/messages" label="Messages" />
                    <Item to={calendarTo} label="Calendar" />
                    <Item to="/app/attendance" label="Attendance" />

                    {(user?.role === "ADMIN" || user?.role === "LECTURER") && (
                      <Item to="/app/manage-results" label="Manage Results" />
                    )}

                    {user?.role === "ADMIN" && (
                      <Item
                        to="/app/admin/parent-links"
                        label="Parent Link Approvals"
                      />
                    )}
                  </>
                )}
              </div>

              <div className="mt-6 rounded-3xl border border-[rgba(140,235,255,0.14)] bg-[rgba(9,23,54,0.72)] p-4 backdrop-blur-xl shadow-[0_0_0_1px_rgba(140,235,255,0.04)_inset,0_10px_24px_rgba(3,10,28,0.28)]">
                <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                  Signed in as
                </div>

                <div className="mt-2 truncate text-sm font-semibold">
                  <span className="app-title-gradient">
                    {user?.email ?? "Unknown"}
                  </span>
                </div>

                <div className="mt-2">
                  <span className="inline-flex items-center rounded-full border border-[#8CEBFF]/30 bg-[#8CEBFF]/10 px-3 py-1 text-xs font-medium text-[#8CEBFF]">
                    {user?.role ?? "Unknown"}
                  </span>
                </div>

                {isStudent && (
                  <div className="mt-3 rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,19,47,0.68)] px-3 py-2 backdrop-blur-xl">
                    <div className="text-sm font-semibold text-[#8CEBFF]">
                      {studentDisplayName}
                    </div>
                    <div className="text-xs text-white/70">
                      {studentCourse}
                    </div>
                  </div>
                )}

                <button
                  onClick={logout}
                  type="button"
                  className="btn-secondary mt-4 w-full"
                  title="Log out of the application"
                  aria-label="Log out of the application"
                >
                  Logout
                </button>
              </div>
            </div>
          </aside>

          {/* Main content area */}
          <main className="glass-panel relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-100">
              <div className="absolute left-0 top-0 h-36 w-36 rounded-full bg-[#8CEBFF]/10 blur-3xl" />
              <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-[#8C5BFF]/10 blur-3xl" />
            </div>

            <div className="relative p-6">
              <AppErrorBoundary>
                <Outlet />
              </AppErrorBoundary>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}