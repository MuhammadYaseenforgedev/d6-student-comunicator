// src/pages/parent/ParentPortalLayout.tsx
// Parent portal layout wrapper.
// Responsibilities:
// - Render the shared Parent Portal page header
// - Render portal navigation tabs
// - Render the active parent portal child route via <Outlet />
// - Use purple blocks to match the updated application theme

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
        subtitle="Overview, finance, results, calendar, and linking (Week 3+)."
      />

      {/* Tabs container */}
      <div className="mt-6 rounded-3xl border border-[#6C44FD] bg-[#794DFA] p-2 text-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <Tab to="/app/parent" end label="Overview" />
          <Tab to="/app/parent/finance" label="Finance" />
          <Tab to="/app/parent/results" label="Results" />
          <Tab to="/app/parent/calendar" label="Calendar" />
          <Tab to="/app/parent/attendance" label="Attendance" />
          <Tab to="/app/parent/children" label="Children" />
        </div>
      </div>

      {/* Active tab page */}
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}

/**
 * Reusable parent portal tab.
 * Active tabs use a deeper purple block.
 */
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
          "rounded-2xl border px-3 py-2 text-center text-sm font-semibold transition",
          isActive
            ? "border-[#794DFA] bg-[#6C44FD] text-white"
            : "border-white/25 bg-transparent text-white hover:bg-[#6C44FD] hover:text-white",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}