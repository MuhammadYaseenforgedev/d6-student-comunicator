// src/pages/parent/ParentResults.tsx
import { useMemo } from "react";

/**
 * ✅ Results tab (frontend-first).
 * Later: hook this to backend "assessments/results" endpoint.
 */
export default function ParentResults() {
  const results = useMemo(() => {
    return [
      { subject: "Mathematics", score: 78, max: 100, date: "2026-02-01" },
      { subject: "English", score: 66, max: 100, date: "2026-02-03" },
      { subject: "Life Sciences", score: 84, max: 100, date: "2026-02-07" },
    ];
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Assessment Results</div>
        <div className="mt-1 text-sm text-slate-400">
          Parents can view marks, but cannot edit anything.
        </div>

        <div className="mt-5 space-y-3">
          {results.map((r) => {
            const pct = Math.round((r.score / r.max) * 100);
            return (
              <div key={`${r.subject}-${r.date}`} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-white font-semibold">{r.subject}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      Date: {new Date(r.date).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-white font-semibold">
                      {r.score}/{r.max} ({pct}%)
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {pct >= 75 ? "Excellent" : pct >= 50 ? "Pass" : "At risk"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Exam Dates</div>
        <div className="mt-2 text-sm text-slate-400">
          When backend is connected: upcoming exam schedule will appear here.
        </div>
      </div>
    </div>
  );
}
