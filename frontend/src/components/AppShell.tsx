// src/components/AppShell.tsx
// Main authenticated application shell.
// Responsibilities:
// - Render the global sidebar
// - Render the current page content via <Outlet />
// - Show role-aware navigation
// - Display logged-in user summary
// - Keep visual styling consistent with the app-wide neon glass theme

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Link,
  NavLink,
  useNavigate,
  useLocation,
  useOutlet,
} from "react-router-dom";
import { getUser, logout as logoutUser } from "../lib/auth";
import {
  adminScopeLabel,
  isAcademicOrSuperAdmin,
  isFinanceAdmin,
  isSuperAdmin,
} from "../lib/adminAccess";
import AppErrorBoundary from "./AppErrorBoundary";
import { fetchMeProfile, type MeProfile } from "../lib/authService";
import AnimatedForgeLogo from "./AnimatedForgeLogo";
import { useNotificationSummary } from "../hooks/useNotificationSummary";
import RoleAssistant from "./RoleAssistant";

function formatBadgeCount(value: number): string {
  if (value > 99) return "99+";
  return String(value);
}

function BurgerButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? "Close navigation menu" : "Open navigation menu"}
      aria-expanded={open}
      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#8CEBFF]/20 bg-[rgba(9,23,54,0.72)] text-white/90 backdrop-blur-xl transition hover:border-[#8CEBFF]/40 hover:text-[#8CEBFF]"
    >
      <span className="relative block h-4 w-5">
        <span
          className={[
            "absolute left-0 top-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300",
            open ? "top-[7px] rotate-45" : "",
          ].join(" ")}
        />
        <span
          className={[
            "absolute left-0 top-[7px] h-0.5 w-5 rounded-full bg-current transition-all duration-300",
            open ? "opacity-0" : "opacity-100",
          ].join(" ")}
        />
        <span
          className={[
            "absolute left-0 top-[14px] h-0.5 w-5 rounded-full bg-current transition-all duration-300",
            open ? "top-[7px] -rotate-45" : "",
          ].join(" ")}
        />
      </span>
    </button>
  );
}

function Item({
  to,
  label,
  badge,
  onNavigate,
  end,
}: {
  to: string;
  label: string;
  badge?: number;
  onNavigate?: () => void;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      end={end}
      className={({ isActive }) =>
        ["nav-item", isActive ? "nav-item-active" : "nav-item-idle"].join(" ")
      }
    >
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">{label}</span>
        {Number(badge ?? 0) > 0 && (
          <span className="shrink-0 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
            {formatBadgeCount(Number(badge))}
          </span>
        )}
      </span>
    </NavLink>
  );
}

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const user = getUser();

  const isParent = user?.role === "PARENT";
  const isStudent = user?.role === "STUDENT";
  const financeAdmin = isFinanceAdmin(user);
  const academicOrSuperAdmin = isAcademicOrSuperAdmin(user);
  const superAdmin = isSuperAdmin(user);

  const calendarTo =
    user?.role === "PARENT" ? "/app/parent/calendar" : "/app/calendar";
  const homeTo = isParent
    ? "/app/parent"
    : financeAdmin
      ? "/app/admin/finance"
      : "/app";
  const homeLabel = isParent ? "Parent Portal" : "Home";

  const userId = user?.id ?? "";
  const userRole = user?.role ?? "";

  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { summary: notificationSummary } = useNotificationSummary();

  useEffect(() => {
    if (userRole !== "STUDENT" || !userId) return;

    let cancelled = false;

    void fetchMeProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, userRole]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

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

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  function logout() {
    logoutUser();
    closeMobileMenu();
    navigate("/login", { replace: true });
  }

  const sidebarContent = (
    <>
      <div className="pointer-events-none absolute inset-0 opacity-100">
        <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-[#8CEBFF]/12 blur-3xl" />
        <div className="absolute -bottom-16 -right-12 h-52 w-52 rounded-full bg-[#8C5BFF]/12 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8CEBFF]/50 to-transparent" />
      </div>

      <div className="relative">
        <Link to={homeTo} className="block" onClick={closeMobileMenu}>
          <AnimatedForgeLogo />
        </Link>

        <div className="mt-6 space-y-1.5">
          {!financeAdmin && (
            <>
              <Item
                to={homeTo}
                label={homeLabel}
                onNavigate={closeMobileMenu}
                end
              />
              <Item
                to="/app/notifications"
                label="Notifications"
                badge={totalUnread}
                onNavigate={closeMobileMenu}
              />
            </>
          )}

          {financeAdmin && (
            <>
              <Item
                to="/app/admin/finance"
                label="Finance"
                badge={financeBadge}
                onNavigate={closeMobileMenu}
              />
              <Item
                to="/app/messages"
                label="Messages"
                badge={messageBadge}
                onNavigate={closeMobileMenu}
              />
            </>
          )}

          {isParent ? (
            <>
              <div className="divider-soft my-3" />
              <Item
                to="/app/parent/results"
                label="Results"
                badge={resultBadge}
                onNavigate={closeMobileMenu}
              />
              <Item
                to="/app/parent/finance"
                label="Finance"
                badge={financeBadge}
                onNavigate={closeMobileMenu}
              />
              <Item
                to={calendarTo}
                label="Calendar"
                onNavigate={closeMobileMenu}
              />
              <Item
                to="/app/parent/attendance"
                label="Attendance"
                badge={attendanceBadge}
                onNavigate={closeMobileMenu}
              />
              <Item
                to="/app/parent/children"
                label="Children"
                badge={parentLinkBadge}
                onNavigate={closeMobileMenu}
              />
              <Item
                to="/app/uploads"
                label="Uploads"
                onNavigate={closeMobileMenu}
              />
              <Item
                to="/app/messages"
                label="Messages"
                badge={messageBadge}
                onNavigate={closeMobileMenu}
              />
            </>
          ) : !financeAdmin ? (
            <>
              <Item
                to="/app/courses"
                label="Courses"
                onNavigate={closeMobileMenu}
              />
              <Item
                to="/app/modules"
                label="Modules"
                onNavigate={closeMobileMenu}
              />
              <Item
                to="/app/faculty"
                label="Faculty"
                onNavigate={closeMobileMenu}
              />
              <Item
                to="/app/clubs"
                label="Clubs"
                onNavigate={closeMobileMenu}
              />
              <Item
                to="/app/emergency"
                label="Emergency"
                badge={emergencyBadge}
                onNavigate={closeMobileMenu}
              />

              <div className="divider-soft my-3" />

              <Item
                to="/app/uploads"
                label="Uploads"
                onNavigate={closeMobileMenu}
              />
              <Item
                to="/app/messages"
                label="Messages"
                badge={messageBadge}
                onNavigate={closeMobileMenu}
              />
              <Item
                to={calendarTo}
                label="Calendar"
                onNavigate={closeMobileMenu}
              />
              <Item
                to="/app/attendance"
                label="Attendance"
                badge={attendanceBadge}
                onNavigate={closeMobileMenu}
              />
              {user?.role === "STUDENT" && (
                <Item
                  to="/app/results"
                  label="Results"
                  badge={resultBadge}
                  onNavigate={closeMobileMenu}
                />
              )}

              {(academicOrSuperAdmin || user?.role === "LECTURER") && (
                <Item
                  to="/app/manage-results"
                  label="Manage Results"
                  badge={resultBadge}
                  onNavigate={closeMobileMenu}
                />
              )}

              {academicOrSuperAdmin && (
                <Item
                  to="/app/admin/users"
                  label="Accounts"
                  onNavigate={closeMobileMenu}
                />
              )}

              {academicOrSuperAdmin && (
                <Item
                  to="/app/admin/parent-links"
                  label="Parent Link Approvals"
                  badge={parentLinkBadge}
                  onNavigate={closeMobileMenu}
                />
              )}

              {superAdmin && (
                <Item
                  to="/app/admin/tickets"
                  label="Tickets"
                  onNavigate={closeMobileMenu}
                />
              )}
            </>
          ) : null}
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
              {user?.role === "ADMIN"
                ? `${adminScopeLabel(user.adminScope)}`
                : user?.role ?? "Unknown"}
            </span>
          </div>

          {isStudent && (
            <div className="mt-3 rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,19,47,0.68)] px-3 py-2 backdrop-blur-xl">
              <div className="text-sm font-semibold text-[#8CEBFF]">
                {studentDisplayName}
              </div>
              <div className="text-xs text-white/70">{studentCourse}</div>
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
    </>
  );

  return (
    <div className="min-h-0">
      <div className="w-full px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6 xl:px-8 2xl:px-10">
        <div className="mb-3 lg:hidden">
          <div className="glass-panel-premium relative overflow-hidden px-3 py-3">
            <div className="pointer-events-none absolute inset-0 opacity-100">
              <div className="absolute -left-10 -top-10 h-28 w-28 rounded-full bg-[#8CEBFF]/12 blur-3xl" />
              <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#8C5BFF]/12 blur-3xl" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8CEBFF]/40 to-transparent" />
            </div>

            <div className="relative flex items-center justify-between gap-3">
              <Link
                to={homeTo}
                className="min-w-0 flex-1"
                onClick={closeMobileMenu}
              >
                <div className="max-w-[190px]">
                  <AnimatedForgeLogo />
                </div>
              </Link>

              <BurgerButton
                open={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((prev) => !prev)}
              />
            </div>
          </div>
        </div>

        <div className="desktop-app-frame grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="glass-panel-premium relative hidden overflow-hidden p-4 lg:block">
            <div className="sidebar-gradient-border-overlay absolute inset-0" />
            {sidebarContent}
          </aside>

          <main className="glass-panel relative min-w-0 overflow-x-hidden">
            <div className="sidebar-gradient-border-overlay absolute inset-0" />
            <div className="pointer-events-none absolute inset-0 opacity-100">
              <div className="absolute left-0 top-0 h-36 w-36 rounded-full bg-[#8CEBFF]/10 blur-3xl" />
              <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-[#8C5BFF]/10 blur-3xl" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8CEBFF]/40 to-transparent" />
            </div>

            <div className="relative min-w-0 p-3 sm:p-4 lg:p-6 xl:p-7">
              <AppErrorBoundary>
                <div className="relative min-w-0 overflow-x-hidden">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={location.pathname}
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="min-w-0"
                    >
                      {outlet}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </AppErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(2,6,23,0.7)] backdrop-blur-sm lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 h-dvh w-[88vw] max-w-[340px] border-r border-[#8CEBFF]/10 bg-[rgba(5,12,30,0.96)] p-4 shadow-2xl backdrop-blur-2xl transition-transform duration-300 lg:hidden",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        aria-hidden={!mobileMenuOpen}
      >
        <div className="glass-panel-premium relative h-full overflow-y-auto overflow-x-hidden p-4">
          <div className="sidebar-gradient-border-overlay absolute inset-0" />
          {sidebarContent}
        </div>
      </aside>

      {user && <RoleAssistant user={user} />}
    </div>
  );
}
