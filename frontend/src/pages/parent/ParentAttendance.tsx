import { useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";
import {
  getParentAttendance,
  listMyChildren,
  type ParentAttendanceRecord,
  type ParentChild,
} from "../../api/parent";
import { toInlineError } from "./errorText";

function childIdentifier(child: ParentChild): string {
  const v = child.childUserId ?? child.studentUserId ?? child.userId ?? child.id;
  return typeof v === "string" ? v.trim() : "";
}

function childLabel(child: ParentChild): string {
  return child.publicStudentId
    ? `${child.publicStudentId} (${child.email})`
    : child.email;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function fromDaysBack(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

export default function ParentAttendance() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [from, setFrom] = useState(fromDaysBack(30));
  const [to, setTo] = useState(todayDate());
  const [records, setRecords] = useState<ParentAttendanceRecord[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [loading, setLoading] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const hasChildren = children.length > 0;

  useEffect(() => {
    let cancelled = false;

    async function loadChildren() {
      setLoadingChildren(true);
      setChildrenError(null);
      try {
        const rows = await listMyChildren();
        if (cancelled) return;
        setChildren(rows);
        const first = rows[0] ? childIdentifier(rows[0]) : "";
        setSelectedChildId(first);
      } catch (e) {
        if (!cancelled) {
          setChildrenError(toInlineError(e, "Failed to load linked children"));
          setChildren([]);
          setSelectedChildId("");
        }
      } finally {
        if (!cancelled) setLoadingChildren(false);
      }
    }

    void loadChildren();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadAttendance(targetChildId: string) {
    if (!targetChildId) {
      setRecords([]);
      setAttendanceError(null);
      return;
    }
    try {
      setLoading(true);
      setAttendanceError(null);
      const out = await getParentAttendance(targetChildId, { from, to });
      setRecords(Array.isArray(out) ? out : []);
    } catch (e) {
      setAttendanceError(toInlineError(e, "Failed to load attendance"));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedChildId) {
      setRecords([]);
      setAttendanceError(null);
      return;
    }
    void loadAttendance(selectedChildId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId]);

  const summary = {
    present: records.filter((r) => r.status === "PRESENT").length,
    absent: records.filter((r) => r.status === "ABSENT").length,
    late: records.filter((r) => r.status === "LATE").length,
    total: records.length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        subtitle="View attendance summary and records for a linked child."
      />

      <div className="rounded-3xl border border-[#d9ccff] bg-white p-4 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            id="parent-attendance-child"
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
            disabled={loadingChildren || children.length === 0}
            aria-label="Select child for attendance"
            title="Select child for attendance"
          >
            {children.length === 0 ? (
              <option value="">
                {loadingChildren
                  ? "Loading linked children..."
                  : "No linked children"}
              </option>
            ) : (
              children.map((child) => (
                <option key={child.id} value={childIdentifier(child)}>
                  {childLabel(child)}
                </option>
              ))
            )}
          </select>

          <input
            id="parent-attendance-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
            aria-label="Attendance from date"
            title="Attendance from date"
          />

          <input
            id="parent-attendance-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-[#d9dde5] bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#794DFA] focus:ring-2 focus:ring-[#794DFA]/15"
            aria-label="Attendance to date"
            title="Attendance to date"
          />

          <button
            type="button"
            onClick={() => void loadAttendance(selectedChildId)}
            disabled={loading || !selectedChildId}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {childrenError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {childrenError}
        </div>
      )}

      {!loadingChildren && !selectedChildId && (
        <div className="rounded-xl border border-[#e2d8ff] bg-[#faf8ff] p-3 text-sm text-slate-700">
          {hasChildren
            ? "Select a child to view this information."
            : "No linked children. Link a child first."}
        </div>
      )}

      {attendanceError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {attendanceError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Summary label="Present" value={summary.present} className="text-emerald-600" />
        <Summary label="Late" value={summary.late} className="text-amber-500" />
        <Summary label="Absent" value={summary.absent} className="text-red-600" />
        <Summary label="Total" value={summary.total} className="text-slate-900" />
      </div>

      <div className="rounded-3xl border border-[#d9ccff] bg-white p-5 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
        <div className="text-lg font-semibold text-slate-900">Attendance Records</div>
        <div className="mt-3 space-y-2">
          {!selectedChildId ? (
            <div className="text-sm text-slate-700">
              Select a child to view this information.
            </div>
          ) : records.length === 0 ? (
            <div className="text-sm text-slate-700">No attendance records found.</div>
          ) : (
            records.map((row) => (
              <div
                key={`${row.sessionId}-${row.markedAt}`}
                className="rounded-2xl border border-[#e2d8ff] bg-white p-3 shadow-[0_8px_20px_rgba(121,77,250,0.06)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#cbb8ff]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {row.moduleCode} - {row.moduleName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.date} | {row.facultyName}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {row.status}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="rounded-3xl border border-[#d9ccff] bg-white p-4 shadow-[0_0_0_1px_rgba(121,77,250,0.05),0_12px_28px_rgba(121,77,250,0.10)]">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={["mt-2 text-2xl font-bold", className].join(" ")}>
        {value}
      </div>
    </div>
  );
}