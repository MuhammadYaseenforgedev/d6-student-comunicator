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
import { useNotificationSummary } from "../hooks/useNotificationSummary";

function formatBadgeCount(value: number): string {
  if (value > 99) return "99+";
  return String(value);
}

function Item({
  to,
  label,
  badge,
}: {
  to: string;
  label: string;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        ["nav-item", isActive ? "nav-item-active" : "nav-item-idle"].join(" ")
      }
    >
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        {Number(badge ?? 0) > 0 && (
          <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
            {formatBadgeCount(Number(badge))}
          </span>
        )}
      </span>
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
  const { summary: notificationSummary } = useNotificationSummary();

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

  const counts = notificationSummary.counts ?? {};
  const totalUnread = Number(notificationSummary.totalUnread ?? 0);
  const messageBadge = Number(counts.MESSAGE ?? 0);
  const emergencyBadge = Number(counts.EMERGENCY ?? 0);
  const attendanceBadge = Number(counts.ATTENDANCE ?? 0);
  const resultBadge = Number(counts.RESULT ?? 0);
  const financeBadge = Number(counts.FINANCE ?? 0);
  const parentLinkBadge = Number(counts.PARENT_LINK ?? 0);

  function logout() {
    clearAuth();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-[calc(100vh-220px)]">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[290px_1fr]">
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
                <Item
                  to="/app/notifications"
                  label="Notifications"
                  badge={totalUnread}
                />

                {isParent ? (
                  <>
                    <div className="divider-soft my-3" />
                    <Item to="/app/parent" label="Overview" />
                    <Item
                      to="/app/parent/results"
                      label="Results"
                      badge={resultBadge}
                    />
                    <Item
                      to="/app/parent/finance"
                      label="Finance"
                      badge={financeBadge}
                    />
                    <Item to={calendarTo} label="Calendar" />
                    <Item
                      to="/app/parent/attendance"
                      label="Attendance"
                      badge={attendanceBadge}
                    />
                    <Item
                      to="/app/parent/children"
                      label="Links"
                      badge={parentLinkBadge}
                    />
                    <Item to="/app/uploads" label="Uploads" />
                    <Item
                      to="/app/messages"
                      label="Messages"
                      badge={messageBadge}
                    />
                  </>
                ) : (
                  <>
                    <Item to="/app/modules" label="Modules" />
                    <Item to="/app/faculty" label="Faculty" />
                    <Item to="/app/clubs" label="Clubs" />
                    <Item
                      to="/app/emergency"
                      label="Emergency"
                      badge={emergencyBadge}
                    />

                    <div className="divider-soft my-3" />

                    <Item to="/app/uploads" label="Uploads" />
                    <Item
                      to="/app/messages"
                      label="Messages"
                      badge={messageBadge}
                    />
                    <Item to={calendarTo} label="Calendar" />
                    <Item
                      to="/app/attendance"
                      label="Attendance"
                      badge={attendanceBadge}
                    />
                    {user?.role === "STUDENT" && (
                      <Item
                        to="/app/results"
                        label="Results"
                        badge={resultBadge}
                      />
                    )}

                    {(user?.role === "ADMIN" || user?.role === "LECTURER") && (
                      <Item
                        to="/app/manage-results"
                        label="Manage Results"
                        badge={resultBadge}
                      />
                    )}

                    {user?.role === "ADMIN" && (
                      <Item
                        to="/app/admin/finance"
                        label="Finance"
                        badge={financeBadge}
                      />
                    )}

                    {user?.role === "ADMIN" && (
                      <Item to="/app/admin/users" label="Accounts" />
                    )}

                    {user?.role === "ADMIN" && (
                      <Item
                        to="/app/admin/parent-links"
                        label="Parent Link Approvals"
                        badge={parentLinkBadge}
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

          <main className="glass-panel relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-100">
              <div className="absolute left-0 top-0 h-36 w-36 rounded-full bg-[#8CEBFF]/10 blur-3xl" />
              <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-[#8C5BFF]/10 blur-3xl" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8CEBFF]/40 to-transparent" />
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