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
  return child.publicStudentId ? `${child.publicStudentId} (${child.email})` : child.email;
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

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            disabled={loadingChildren || children.length === 0}
          >
            {children.length === 0 ? (
              <option value="">{loadingChildren ? "Loading linked children..." : "No linked children"}</option>
            ) : (
              children.map((child) => (
                <option key={child.id} value={childIdentifier(child)}>
                  {childLabel(child)}
                </option>
              ))
            )}
          </select>

          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
          />

          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
          />

          <button
            type="button"
            onClick={() => void loadAttendance(selectedChildId)}
            disabled={loading || !selectedChildId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {childrenError && (
        <div className="rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
          {childrenError}
        </div>
      )}

      {!loadingChildren && !selectedChildId && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300">
          {hasChildren ? "Select a child to view this information." : "No linked children. Link a child first."}
        </div>
      )}

      {attendanceError && (
        <div className="rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
          {attendanceError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Summary label="Present" value={summary.present} className="text-emerald-300" />
        <Summary label="Late" value={summary.late} className="text-yellow-300" />
        <Summary label="Absent" value={summary.absent} className="text-red-300" />
        <Summary label="Total" value={summary.total} className="text-white" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Attendance Records</div>
        <div className="mt-3 space-y-2">
          {!selectedChildId ? (
            <div className="text-sm text-slate-300">Select a child to view this information.</div>
          ) : records.length === 0 ? (
            <div className="text-sm text-slate-300">No attendance records found.</div>
          ) : (
            records.map((row) => (
              <div
                key={`${row.sessionId}-${row.markedAt}`}
                className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-100">
                      {row.moduleCode} - {row.moduleName}
                    </div>
                    <div className="text-xs text-slate-400">
                      {row.date} | {row.facultyName}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-slate-200">{row.status}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={["mt-2 text-2xl font-bold", className].join(" ")}>{value}</div>
    </div>
  );
}
