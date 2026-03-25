// src/pages/parent/ParentPortalLayout.tsx
// Parent portal layout wrapper.
// Responsibilities:
// - Render the shared Parent Portal page header
// - Render portal navigation tabs
// - Render the active parent portal child route via <Outlet />
// - Match the neon glass theme used across the app

import { NavLink, Outlet } from "react-router-dom";
import PageHeader from "../../components/PageHeader";

/**
 * Parent portal wrapper.
 * Includes parent-specific navigation tabs.
 */
export default function ParentPortalLayout() {
  return (
    <div>
      <PageHeader
        title="Parent Portal"
        subtitle="Overview, finance, results, calendar, and linking."
      />

      <div className="mt-6 teal-glow-card p-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <Tab to="/app/parent" end label="Overview" />
          <Tab to="/app/parent/finance" label="Finance" />
          <Tab to="/app/parent/results" label="Results" />
          <Tab to="/app/parent/calendar" label="Calendar" />
          <Tab to="/app/parent/attendance" label="Attendance" />
          <Tab to="/app/parent/children" label="Children" />
        </div>
      </div>

      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}

function Tab({
  to,
  label,
  end,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "rounded-2xl border px-3 py-2 text-center text-sm font-semibold transition-all duration-200",
          isActive
            ? "border-[rgba(140,235,255,0.30)] bg-[rgba(14,42,99,0.72)] text-white shadow-[0_0_18px_rgba(140,235,255,0.16)]"
            : "border-transparent bg-transparent text-white/78 hover:border-[rgba(140,235,255,0.22)] hover:bg-[rgba(140,235,255,0.08)] hover:text-white",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}