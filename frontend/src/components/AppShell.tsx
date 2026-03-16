// src/components/AppShell.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearAuth, getUser } from "../lib/auth";
import AppErrorBoundary from "./AppErrorBoundary";
import { fetchMeProfile, type MeProfile } from "../lib/authService";
import { useNotificationSummary } from "../hooks/useNotificationSummary";

function formatBadgeCount(value: number): string {
  if (value > 99) return "99+";
  return String(value);
}

function Item({ to, label, badge }: { to: string; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "block rounded-lg px-3 py-2 text-sm border transition",
          isActive
            ? "bg-white/10 border-white/15 text-white"
            : "bg-transparent border-transparent text-white/75 hover:bg-white/5 hover:border-white/10 hover:text-white",
        ].join(" ")
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
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();
  const isParent = user?.role === "PARENT";
  const isStudent = user?.role === "STUDENT";
  const calendarTo = user?.role === "PARENT" ? "/app/parent/calendar" : "/app/calendar";
  const homeTo = isParent ? "/app/parent" : "/app";
  const userId = user?.id ?? "";
  const userRole = user?.role ?? "";
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const { summary: notificationSummary } = useNotificationSummary();

  useEffect(() => {
    if (userRole !== "STUDENT" || !userId) {
      return;
    }

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

    const title =
      location.pathname.includes("/calendar")
        ? "Calendar"
      : location.pathname.includes("/admin/finance")
      ? "Finance"
      : location.pathname.includes("/admin/users")
      ? "Accounts"
      : location.pathname.includes("/admin/parent-links")
      ? "Parent Link Approvals"
      : location.pathname.includes("/manage-results")
      ? "Manage Results"
      : location.pathname.includes("/uploads")
      ? "Uploads"
      : location.pathname.includes("/attendance")
       ? "Attendance"
      : location.pathname.includes("/notifications")
      ? "Notifications"
      : location.pathname.includes("/modules")
      ? "Modules"
      : location.pathname.includes("/faculty")
      ? "Faculty"
      : location.pathname.includes("/clubs")
      ? "Clubs"
      : location.pathname.includes("/emergency")
      ? "Emergency"
      : location.pathname.includes("/messages")
      ? "Messages"
      : location.pathname.includes("/parent")
      ? "Parent Portal"
      : location.pathname.includes("/c/")
      ? "Channel"
      : "Home";

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[270px_1fr]">
          {/* Sidebar */}
          <aside className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 backdrop-blur-xl p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            {/* Subtle brand accent */}
            <div className="pointer-events-none absolute inset-0 opacity-60">
              <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
              <div className="absolute -bottom-28 -right-28 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
            </div>

            <div className="relative">
              <Link to="/app" className="block">
                <div className="text-xl font-bold">
                  <span className="bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent">
                    D6 Communicator
                  </span>
                </div>
                <div className="text-xs text-white/60 mt-1">
                  Auth, Messaging, Uploads, Calendar, Parent Portal
                </div>
              </Link>

              <div className="mt-5 space-y-1">
                <Item to={homeTo} label="Home" />
                <Item to="/app/notifications" label="Notifications" badge={totalUnread} />

                {isParent ? (
                  <>
                    <div className="my-3 h-px bg-white/10" />
                    <Item to="/app/parent" label="Overview" />
                    <Item to="/app/parent/results" label="Results" badge={resultBadge} />
                    <Item to="/app/parent/finance" label="Finance" badge={financeBadge} />
                    <Item to={calendarTo} label="Calendar" />
                    <Item to="/app/parent/attendance" label="Attendance" badge={attendanceBadge} />
                    <Item to="/app/parent/children" label="Links" badge={parentLinkBadge} />
                    <Item to="/app/uploads" label="Uploads" />
                    <Item to="/app/messages" label="Messages" badge={messageBadge} />
                  </>
                ) : (
                  <>
                    <Item to="/app/modules" label="Modules" />
                    <Item to="/app/faculty" label="Faculty" />
                    <Item to="/app/clubs" label="Clubs" />
                    <Item to="/app/emergency" label="Emergency" badge={emergencyBadge} />

                    <div className="my-3 h-px bg-white/10" />

                    <Item to="/app/uploads" label="Uploads" />
                    <Item to="/app/messages" label="Messages" badge={messageBadge} />
                    <Item to={calendarTo} label="Calendar" />
                    <Item to="/app/attendance" label="Attendance" badge={attendanceBadge} />

                     {(user?.role === "ADMIN" || user?.role === "LECTURER") && (
                       <Item to="/app/manage-results" label="Manage Results" badge={resultBadge} />
                     )}
                     {user?.role === "ADMIN" && <Item to="/app/admin/finance" label="Finance" badge={financeBadge} />}
                     {user?.role === "ADMIN" && <Item to="/app/admin/users" label="Accounts" />}
                     {user?.role === "ADMIN" && <Item to="/app/admin/parent-links" label="Parent Link Approvals" />}
                  </>
                )}
              </div>

              <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">Signed in as</div>
                <div className="text-sm font-semibold truncate">{user?.email ?? "Unknown"}</div>
                <div className="text-xs text-white/60">Role: {user?.role ?? "Unknown"}</div>

                <button
                  onClick={logout}
                  type="button"
                  className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
                >
                  Logout
                </button>
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="rounded-2xl border border-white/10 bg-slate-950/25 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="text-lg font-semibold">{title}</div>
                <div className="text-xs text-white/60">{location.pathname}</div>
                {isStudent && (
                  <div className="mt-2">
                    <div className="text-sm font-semibold text-cyan-200">{studentDisplayName}</div>
                    <div className="text-xs text-white/70">{studentCourse}</div>
                  </div>
                )}
              </div>

              <div className="hidden md:flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)]" />
                <div className="text-xs text-white/60">
                  {totalUnread > 0 ? `${formatBadgeCount(totalUnread)} unread notification(s)` : "Frontend active"}
                </div>
              </div>
            </div>

            <div className="p-6">
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
