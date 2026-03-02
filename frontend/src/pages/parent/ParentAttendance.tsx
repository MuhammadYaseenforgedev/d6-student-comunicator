import { useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { getMyAttendance, type AttendanceMeResponse } from "../../lib/attendanceApi";
import { listMyChildren, type ParentChild } from "../../api/parent";

function childIdentifier(child: ParentChild): string {
  return child.id;
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
  const [childId, setChildId] = useState("");
  const [from, setFrom] = useState(fromDaysBack(30));
  const [to, setTo] = useState(todayDate());
  const [data, setData] = useState<AttendanceMeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadChildren() {
      try {
        const rows = await listMyChildren();
        if (cancelled) return;
        setChildren(rows);
        const first = rows[0]?.id ?? "";
        setChildId(first);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load linked children");
      }
    }

    void loadChildren();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadAttendance(targetChildId: string) {
    if (!targetChildId) {
      setData(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const out = await getMyAttendance({ childId: targetChildId, from, to });
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendance");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!childId) return;
    void loadAttendance(childId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  const summary = data?.summary ?? { present: 0, absent: 0, late: 0, total: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        subtitle="View attendance summary and records for a linked child."
      />

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            disabled={children.length === 0}
          >
            {children.length === 0 ? (
              <option value="">No linked children</option>
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
            onClick={() => void loadAttendance(childId)}
            disabled={loading || !childId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
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
          {(data?.value ?? []).length === 0 ? (
            <div className="text-sm text-slate-300">No attendance records found.</div>
          ) : (
            data!.value.map((row) => (
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
