// src/pages/parent/ParentCalendar.tsx
// Parent tab: calendar view-only.
// Parents can view campus events, but do NOT create notes here (students only).
// This reuses the same calendar hook/store used by /app/calendar so everything stays consistent.

import { useMemo } from "react";
import PageHeader from "../../components/PageHeader";
import { useCalendar } from "../../hooks/useCalendar";
import type { CalendarEvent } from "../../lib/types";

// Small badge styling helper for event categories
function badgeFor(cat?: CalendarEvent["category"]) {
  if (cat === "EXAM") return "border-red-700/40 bg-red-950/30 text-red-200";
  if (cat === "ASSESSMENT") return "border-yellow-700/40 bg-yellow-950/30 text-yellow-200";
  if (cat === "HOLIDAY") return "border-green-700/40 bg-green-950/30 text-green-200";
  return "border-slate-700 bg-slate-950/40 text-slate-200";
}

export default function ParentCalendar() {
  // ✅ Use the real calendar hook so Parent tab matches /app/calendar data
  const { events, loading, error, reload } = useCalendar();

  // Group events by date for a clean UI (same idea as your Calendar page)
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();

    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }

    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events]);

  return (
    <div>
      {/* Header for the parent tab */}
      <PageHeader
        title="Calendar"
        subtitle="Parents can view the campus calendar. Students add personal notes in the main Calendar page."
        actions={
          <button
            type="button"
            onClick={reload}
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-900/50"
          >
            Refresh
          </button>
        }
      />

      {/* Error (if something breaks in the store/hook) */}
      {error && (
        <div className="mt-5 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Calendar list */}
      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Campus calendar</div>
        <div className="mt-1 text-sm text-slate-400">
          Read-only events uploaded by campus (admin/lecturer in this MVP).
        </div>

        <div className="mt-5 space-y-4">
          {loading ? (
            <div className="text-slate-400">Loading…</div>
          ) : grouped.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-6 text-slate-300">
              No calendar events yet.
            </div>
          ) : (
            grouped.map(([date, dayEvents]) => (
              <div
                key={date}
                className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
              >
                {/* Date header */}
                <div className="text-white font-semibold">{date}</div>

                {/* Events for that date */}
                <div className="mt-3 space-y-3">
                  {dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/30 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-white font-semibold">{ev.title}</div>

                          {ev.description && (
                            <div className="mt-1 text-sm text-slate-300">
                              {ev.description}
                            </div>
                          )}

                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={[
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                                badgeFor(ev.category),
                              ].join(" ")}
                            >
                              {ev.category ?? "GENERAL"}
                            </span>

                            <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-2 py-0.5 text-xs text-slate-300">
                              Posted by {ev.createdByRole}
                            </span>
                          </div>
                        </div>

                        {/* ✅ Parent: no note buttons here */}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Parent note UI intentionally removed (per your rule: student notes only).
         If you later want parent notes too, we can add it safely without touching campus events. */}
    </div>
  );
}
