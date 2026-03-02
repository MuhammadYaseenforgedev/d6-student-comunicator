// src/pages/parent/ParentPortalLayout.tsx
import { NavLink, Outlet } from "react-router-dom";
import PageHeader from "../../components/PageHeader";

/**
 * ✅ Parent portal "tabs" wrapper.
 * Now includes "Children" tab (linking by child ID + admin approval).
 */
export default function ParentPortalLayout() {
  return (
    <div>
      <PageHeader
        title="Parent Portal"
        subtitle="Overview, finance, results, calendar, and linking (Week 3+)."
      />

      {/* Tabs */}
      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/30 p-2">
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
 * Small reusable tab component (so styling stays consistent).
 */
function Tab({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "rounded-xl border px-3 py-2 text-sm font-semibold transition text-center",
          isActive
            ? "bg-slate-800/70 border-slate-700 text-white"
            : "bg-transparent border-slate-800 text-slate-300 hover:bg-slate-900/60 hover:text-white",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}
