import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { useCalendarApi, type CalendarEntry } from "../../hooks/useCalendarApi";
import { listMyChildren, type ParentChild } from "../../api/parent";
import { toInlineError } from "./errorText";

type Grouped = Array<[string, CalendarEntry[]]>;

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function childLabel(c: ParentChild) {
  return c.publicStudentId ? `${c.publicStudentId} (${c.email})` : c.email;
}

export default function ParentCalendar() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [childId, setChildId] = useState<string>("");
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const hasChildren = children.length > 0;

  // Parent must pass student UUID to the calendar endpoint.
  const { loading, error, grouped, reload, refresh } = useCalendarApi(childId || undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingChildren(true);
      setChildrenError(null);
      try {
        const list = await listMyChildren();
        if (cancelled) return;
        setChildren(Array.isArray(list) ? list : []);
        setChildId((prev) => prev || (list[0]?.id ?? ""));
      } catch (e) {
        if (!cancelled) {
          setChildrenError(toInlineError(e, "Failed to load children"));
          setChildren([]);
          setChildId("");
        }
      } finally {
        if (!cancelled) setLoadingChildren(false);
      }
    }
    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedChildLabel = useMemo(() => {
    const c = children.find((x) => x.id === childId);
    return c ? childLabel(c) : "";
  }, [children, childId]);

  const groupedTyped = (Array.isArray(grouped) ? grouped : []) as Grouped;
  const calendarError = error ? toInlineError(error, "Failed to load calendar") : null;

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={
          childId
            ? `Viewing ${selectedChildLabel}'s calendar (view-only).`
            : "Select a child to view their calendar (view-only)."
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const runRefresh = refresh ?? reload;
                if (runRefresh) void runRefresh();
              }}
              className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-900/50"
              disabled={!childId}
            >
              Refresh
            </button>
          </div>
        }
      />

      {/* Child selector */}
      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
        <div className="text-sm font-semibold">Child</div>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-cyan-500/50 sm:max-w-md"
            disabled={loadingChildren || !hasChildren}
          >
            {children.length === 0 ? (
              <option value="">
                {loadingChildren ? "Loading children..." : "No linked children found"}
              </option>
            ) : (
              children.map((c) => (
                <option key={c.id} value={c.id}>
                  {childLabel(c)} ({c.role})
                </option>
              ))
            )}
          </select>

          {childrenError && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-2 text-sm text-red-200">
              {childrenError}
            </div>
          )}
        </div>

        <div className="mt-2 text-xs text-slate-400">
          Parents can view a child's entries, but cannot create or delete.
        </div>
      </div>

      {/* Errors */}
      {calendarError && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">
          {calendarError}
        </div>
      )}

      {/* List */}
      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          <span className="text-xs text-slate-400">{loading ? "Loading..." : ""}</span>
        </div>

        {!childId ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
            {hasChildren
              ? "Select a child to load their calendar."
              : "No linked children found. Link a child first to view calendar."}
          </div>
        ) : groupedTyped.length === 0 && !loading ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
            No events found
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {groupedTyped.map(([day, entries]) => (
              <div key={day}>
                <div className="mb-2 text-xs font-semibold text-slate-300">{day}</div>

                <div className="space-y-2">
                  {entries.map((it) => (
                    <div key={it.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                      <div className="font-semibold">{it.title}</div>
                      <div className="mt-1 text-xs text-slate-300">
                        {fmt(it.startsAt)} - {fmt(it.endsAt)}
                      </div>
                      {it.location && <div className="mt-1 text-xs text-slate-400">{it.location}</div>}
                      {it.description && (
                        <div className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                          {it.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
