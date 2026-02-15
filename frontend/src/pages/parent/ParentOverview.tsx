// src/pages/parent/ParentOverview.tsx
import { Link } from "react-router-dom";

/**
 * ✅ Parent overview tab.
 * Quick cards that link to the real sections.
 */
export default function ParentOverview() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card
        title="Finance"
        desc="View balance, statements, and payment status."
        to="/app/parent/finance"
      />
      <Card
        title="Results"
        desc="View assessment scores and term performance."
        to="/app/parent/results"
      />
      <Card
        title="Calendar"
        desc="View campus calendar and add personal notes."
        to="/app/parent/calendar"
      />
      <Card
        title="Children"
        desc="Link children using ID (admin approval required)."
        to="/app/parent/children"
      />

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Tip</div>
        <p className="mt-2 text-sm text-slate-400">
          This portal matches the backend structure: separate endpoints for finance, results, calendar,
          and parent-child linking. No rewrites needed, just swap stores for API.
        </p>
      </div>
    </div>
  );
}

function Card({ title, desc, to }: { title: string; desc: string; to: string }) {
  return (
    <Link
      to={to}
      className="block rounded-2xl border border-slate-800 bg-slate-950/30 p-5 hover:bg-slate-900/40 transition"
    >
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm text-slate-400">{desc}</div>
      <div className="mt-4 text-sm font-semibold text-blue-400 underline">
        Open {title}
      </div>
    </Link>
  );
}
