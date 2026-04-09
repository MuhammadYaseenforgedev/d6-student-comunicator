import { useEffect, useMemo, useState } from "react";
import CalendarWorkspace from "../../components/calendar/CalendarWorkspace";
import PageHeader from "../../components/PageHeader";
import { listMyChildren, type ParentChild } from "../../api/parent";
import { toInlineError } from "./errorText";

function childLabel(child: ParentChild) {
  return child.publicStudentId ? `${child.publicStudentId} (${child.email})` : child.email;
}

function childCalendarId(child: ParentChild): string {
  const value = child.childUserId ?? child.studentUserId ?? child.userId ?? child.id;
  return typeof value === "string" ? value.trim() : "";
}

export default function ParentCalendar() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingChildren(true);
      setChildrenError(null);

      try {
        const list = await listMyChildren();
        if (cancelled) return;

        const rows = Array.isArray(list) ? list : [];
        setChildren(rows);
        const firstChildId = rows.map(childCalendarId).find(Boolean) ?? "";
        setSelectedChildId((current) => current || firstChildId);
      } catch (e) {
        if (!cancelled) {
          setChildren([]);
          setSelectedChildId("");
          setChildrenError(toInlineError(e, "Failed to load children"));
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
    const child = children.find((item) => childCalendarId(item) === selectedChildId);
    return child ? childLabel(child) : "";
  }, [children, selectedChildId]);

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={
          selectedChildId
            ? `Viewing ${selectedChildLabel}'s calendar in a richer read-only workspace.`
            : "Select a linked child to view their calendar."
        }
      />

      <div className="mt-6 space-y-6">
        <div className="teal-glow-card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-white">Child calendar</div>
              <p className="text-sm text-white/70">
                Parents stay in view-only mode. The calendar still respects the existing linked-child and course visibility rules.
              </p>
            </div>

            <div className="w-full max-w-xl">
              <label htmlFor="parent-calendar-child" className="text-sm text-white/78">
                Select child
              </label>
              <select
                id="parent-calendar-child"
                value={selectedChildId}
                onChange={(event) => setSelectedChildId(event.target.value)}
                className="select-glass mt-1"
                disabled={loadingChildren || children.length === 0}
              >
                {children.length === 0 ? (
                  <option value="">
                    {loadingChildren ? "Loading linked children..." : "No linked children found"}
                  </option>
                ) : (
                  children.map((child) => (
                    <option key={child.id} value={childCalendarId(child)}>
                      {childLabel(child)} ({child.role})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {childrenError && <div className="error-banner mt-4">{childrenError}</div>}
        </div>

        {selectedChildId ? (
          <CalendarWorkspace childId={selectedChildId} />
        ) : (
          <div className="teal-glow-card p-5">
            <div className="rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.56)] p-4 text-sm text-white/76">
              {children.length > 0
                ? "Choose a child above to load their calendar."
                : "No linked children are available yet. Link a child first to view their calendar."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
