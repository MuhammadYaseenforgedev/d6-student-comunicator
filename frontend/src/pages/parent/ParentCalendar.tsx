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

function childCalendarId(child: ParentChild): string {
  const v = child.childUserId ?? child.studentUserId ?? child.userId ?? child.id;
  return typeof v === "string" ? v.trim() : "";
}

export default function ParentCalendar() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const hasChildren = children.length > 0;

  const { loading, error, grouped, reload, refresh } = useCalendarApi(
    undefined,
    selectedChildId || undefined
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingChildren(true);
      setChildrenError(null);
      try {
        const list = await listMyChildren();
        if (cancelled) return;
        setChildren(Array.isArray(list) ? list : []);
        const firstChildId =
          (Array.isArray(list) ? list : [])
            .map(childCalendarId)
            .find(Boolean) ?? "";
        setSelectedChildId((prev) => prev || firstChildId);
      } catch (e) {
        if (!cancelled) {
          setChildrenError(toInlineError(e, "Failed to load children"));
          setChildren([]);
          setSelectedChildId("");
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
    const c = children.find((x) => childCalendarId(x) === selectedChildId);
    return c?.email ?? "";
  }, [children, selectedChildId]);

  const groupedTyped = useMemo(() => {
    const value = (Array.isArray(grouped) ? grouped : []) as Grouped;
    return value.map(([day, entries]) => [
      day,
      [...entries].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    ]) as Grouped;
  }, [grouped]);

  const calendarError =
    typeof error === "string" && error.trim() ? error.trim() : null;

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={
          selectedChildId
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
              className="btn-secondary px-3 py-2 text-sm"
              disabled={!selectedChildId}
            >
              Refresh
            </button>
          </div>
        }
      />

      <div className="mt-4 teal-glow-card p-4">
        <div className="text-sm font-semibold text-white">Child</div>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            id="parent-calendar-child"
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="input-glass w-full sm:max-w-md"
            disabled={loadingChildren || !hasChildren}
            aria-label="Select child for calendar"
            title="Select child for calendar"
          >
            {children.length === 0 ? (
              <option value="">
                {loadingChildren ? "Loading children..." : "No linked children found"}
              </option>
            ) : (
              children.map((c) => (
                <option key={c.id} value={childCalendarId(c)}>
                  {childLabel(c)} ({c.role})
                </option>
              ))
            )}
          </select>

          {childrenError && (
            <div className="error-banner p-2 text-sm">{childrenError}</div>
          )}
        </div>

        <div className="mt-2 text-xs text-white/60">
          Parents can view a child&apos;s entries, but cannot create or delete.
        </div>
      </div>

      {calendarError && (
        <div className="error-banner mt-3 p-3 text-sm">{calendarError}</div>
      )}

      <div className="mt-6 teal-glow-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Upcoming</h2>
          <span className="text-xs text-white/55">{loading ? "Loading..." : ""}</span>
        </div>

        {!selectedChildId ? (
          <div className="mt-4 rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-4 text-sm text-white/80">
            {hasChildren
              ? "Select a child to load their calendar."
              : "No linked children. Link a child first."}
          </div>
        ) : groupedTyped.length === 0 && !loading ? (
          <div className="mt-4 rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-4 text-sm text-white/80">
            No events found
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {groupedTyped.map(([day, entries]) => (
              <div key={day}>
                <div className="mb-2 text-xs font-semibold text-[#8CEBFF]">
                  {day}
                </div>

                <div className="space-y-2">
                  {entries.map((it) => (
                    <div
                      key={it.id}
                      className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4 shadow-[0_0_18px_rgba(140,235,255,0.08)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.34)] hover:bg-[rgba(14,42,99,0.62)]"
                    >
                      <div className="font-semibold text-white">{it.title}</div>
                      <div className="mt-1 text-xs text-white/60">
                        {fmt(it.startsAt)} - {fmt(it.endsAt)}
                      </div>
                      {it.location && (
                        <div className="mt-1 text-xs text-white/55">
                          {it.location}
                        </div>
                      )}
                      {it.description && (
                        <div className="mt-2 whitespace-pre-wrap text-sm text-white/72">
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