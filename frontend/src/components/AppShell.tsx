// src/components/AppShell.tsx
// Main authenticated application shell.
// Responsibilities:
// - Render the global sidebar
// - Render the current page content via <Outlet />
// - Show role-aware navigation
// - Display logged-in user summary
// - Keep visual styling consistent with the app-wide light theme

import { useEffect, useMemo, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { clearAuth, getUser } from "../lib/auth";
import AppErrorBoundary from "./AppErrorBoundary";
import { fetchMeProfile, type MeProfile } from "../lib/authService";

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
  const location = useLocation();
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

  const title =
    location.pathname.includes("/calendar")
      ? "Calendar"
      : location.pathname.includes("/admin/parent-links")
      ? "Parent Link Approvals"
      : location.pathname.includes("/manage-results")
      ? "Manage Results"
      : location.pathname.includes("/uploads")
      ? "Uploads"
      : location.pathname.includes("/attendance")
      ? "Attendance"
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
              <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-[#4EC2F3]/10 blur-3xl" />
              <div className="absolute -bottom-16 -right-12 h-52 w-52 rounded-full bg-[#794DFA]/10 blur-3xl" />
            </div>

            <div className="relative">
              <Link to={homeTo} className="block">
                <div className="text-2xl font-bold tracking-tight">
                  <span className="app-title-gradient">Forge Communicator</span>
                </div>
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

              <div className="mt-6 rounded-3xl border border-[#DADDE2] bg-[#F8FAFC] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-black">
                  Signed in as
                </div>

                <div className="mt-2 truncate text-sm font-semibold text-black">
                  {user?.email ?? "Unknown"}
                </div>

                <div className="mt-1 text-xs text-black">
                  Role: {user?.role ?? "Unknown"}
                </div>

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
              <div className="absolute left-0 top-0 h-32 w-32 rounded-full bg-[#4EC2F3]/8 blur-3xl" />
              <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#7EF3E3]/10 blur-3xl" />
            </div>

            <div className="relative border-b border-[#DADDE2] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-semibold tracking-tight text-slate-900">
                    {title}
                  </div>

                  <div className="mt-1 text-xs text-black">
                    {location.pathname}
                  </div>

                  {isStudent && (
                    <div className="mt-3 rounded-2xl border border-[#DADDE2] bg-[#F8FAFC] px-3 py-2">
                      <div className="text-sm font-semibold text-slate-900">
                        {studentDisplayName}
                      </div>
                      <div className="text-xs text-black">
                        {studentCourse}
                      </div>
                    </div>
                  )}
                </div>

                <div className="hidden items-center gap-2 md:flex">
                  <div className="status-dot" />
                  <div className="text-xs text-black">Live</div>
                </div>
              </div>
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