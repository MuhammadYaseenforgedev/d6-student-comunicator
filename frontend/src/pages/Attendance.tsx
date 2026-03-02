import { type ReactNode, useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import {
  createAttendanceSession,
  getMyAttendance,
  listAttendanceModuleStudents,
  listAttendanceModules,
  listAttendanceSessions,
  markAttendanceSession,
  type AttendanceMeResponse,
  type AttendanceModule,
  type AttendanceModuleStudent,
  type AttendanceSession,
  type AttendanceStatus,
} from "../lib/attendanceApi";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function statusClass(status: AttendanceStatus): string {
  if (status === "PRESENT") return "text-emerald-300";
  if (status === "LATE") return "text-yellow-300";
  return "text-red-300";
}

type MarkMap = Record<string, AttendanceStatus>;

function roleLabel(role: string): string {
  return String(role ?? "").toUpperCase();
}

function sortStudents(rows: AttendanceModuleStudent[]): AttendanceModuleStudent[] {
  return [...rows].sort((a, b) => {
    const aKey = `${a.lastName ?? ""} ${a.firstName ?? ""} ${a.email}`.toLowerCase();
    const bKey = `${b.lastName ?? ""} ${b.firstName ?? ""} ${b.email}`.toLowerCase();
    return aKey.localeCompare(bKey);
  });
}

export default function AttendancePage() {
  const user = getUser();
  const role = roleLabel(user?.role ?? "");

  if (role === "LECTURER" || role === "ADMIN") {
    return <LecturerAttendanceView role={role} />;
  }

  return <StudentAttendanceView />;
}

function LecturerAttendanceView({ role }: { role: "LECTURER" | "ADMIN" }) {
  const [modules, setModules] = useState<AttendanceModule[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [students, setStudents] = useState<AttendanceModuleStudent[]>([]);
  const [marks, setMarks] = useState<MarkMap>({});

  const [moduleId, setModuleId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [date, setDate] = useState(todayDate());
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [lecturerId, setLecturerId] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedModule = useMemo(
    () => modules.find((m) => m.id === moduleId) ?? null,
    [modules, moduleId]
  );

  async function loadModules() {
    const rows = await listAttendanceModules();
    setModules(rows);
    if (!moduleId && rows[0]?.id) {
      setModuleId(rows[0].id);
      if (role === "ADMIN" && rows[0].lecturers[0]?.id) {
        setLecturerId(rows[0].lecturers[0].id);
      }
    }
  }

  async function loadSessions(currentModuleId: string, currentDate: string) {
    if (!currentModuleId) {
      setSessions([]);
      setSessionId("");
      return;
    }
    const rows = await listAttendanceSessions({ moduleId: currentModuleId, date: currentDate });
    setSessions(rows);
    if (!sessionId && rows[0]?.id) setSessionId(rows[0].id);
  }

  async function loadStudents(currentModuleId: string) {
    if (!currentModuleId) {
      setStudents([]);
      setMarks({});
      return;
    }
    const rows = sortStudents(await listAttendanceModuleStudents(currentModuleId));
    setStudents(rows);
    const nextMarks: MarkMap = {};
    for (const s of rows) nextMarks[s.id] = "PRESENT";
    setMarks(nextMarks);
  }

  useEffect(() => {
    void loadModules().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load attendance modules");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!moduleId) return;
    setError(null);
    setInfo(null);
    void loadStudents(moduleId).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load module students");
    });
    void loadSessions(moduleId, date).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load attendance sessions");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, date]);

  useEffect(() => {
    if (role !== "ADMIN") return;
    if (!selectedModule) return;
    const firstLecturer = selectedModule.lecturers[0]?.id ?? "";
    setLecturerId(firstLecturer);
  }, [role, selectedModule]);

  async function createSession() {
    if (!moduleId) {
      setError("Select a module first.");
      return;
    }
    if (role === "ADMIN" && !lecturerId) {
      setError("Select a lecturer for this session.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);

      const created = await createAttendanceSession({
        moduleId,
        date,
        startsAt: startsAt || undefined,
        endsAt: endsAt || undefined,
        lecturerId: role === "ADMIN" ? lecturerId : undefined,
      });

      setInfo(`Session created for ${created.date}.`);
      await loadSessions(moduleId, date);
      setSessionId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setBusy(false);
    }
  }

  async function submitMarks() {
    if (!sessionId) {
      setError("Select a session to mark.");
      return;
    }
    if (students.length === 0) {
      setError("No enrolled students found for this module.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);

      const payload = students.map((s) => ({
        studentId: s.id,
        status: marks[s.id] ?? "PRESENT",
      }));
      const result = await markAttendanceSession(sessionId, payload);
      setInfo(`Attendance submitted (${result.count} record(s)).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit attendance");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        subtitle="Create attendance sessions and mark student status for the selected module."
      />

      {error && <Alert tone="error" message={error} />}
      {info && <Alert tone="info" message={info} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="text-lg font-semibold text-white">Create Session</div>

          <Field label="Module">
            <select
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            >
              {modules.length === 0 ? (
                <option value="">No modules available</option>
              ) : (
                modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} - {m.name} ({m.enrolledCount} students)
                  </option>
                ))
              )}
            </select>
          </Field>

          {role === "ADMIN" && (
            <Field label="Lecturer">
              <select
                value={lecturerId}
                onChange={(e) => setLecturerId(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              >
                {selectedModule?.lecturers.length ? (
                  selectedModule.lecturers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.email}
                    </option>
                  ))
                ) : (
                  <option value="">No assigned lecturer for this module</option>
                )}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Start (optional)">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="End (optional)">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={createSession}
            disabled={busy || !moduleId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Creating..." : "Create Session"}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="text-lg font-semibold text-white">Mark Attendance</div>

          <Field label="Session">
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            >
              {sessions.length === 0 ? (
                <option value="">No session for selected date/module</option>
              ) : (
                sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.date} - {s.moduleCode} {s.moduleName}
                  </option>
                ))
              )}
            </select>
          </Field>

          <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-800">
            {students.length === 0 ? (
              <div className="p-4 text-sm text-slate-300">No enrolled students for this module.</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/50 text-slate-300">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Student</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const name = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.email;
                    return (
                      <tr key={s.id} className="border-t border-slate-800">
                        <td className="px-3 py-2 text-slate-200">
                          <div>{name}</div>
                          <div className="text-xs text-slate-400">{s.studentNumber ?? s.email}</div>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={marks[s.id] ?? "PRESENT"}
                            onChange={(e) =>
                              setMarks((prev) => ({
                                ...prev,
                                [s.id]: e.target.value as AttendanceStatus,
                              }))
                            }
                            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-sm"
                          >
                            <option value="PRESENT">PRESENT</option>
                            <option value="ABSENT">ABSENT</option>
                            <option value="LATE">LATE</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <button
            type="button"
            onClick={submitMarks}
            disabled={busy || !sessionId || students.length === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Submitting..." : "Submit Attendance"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StudentAttendanceView() {
  const [from, setFrom] = useState(defaultFromDate(30));
  const [to, setTo] = useState(todayDate());
  const [data, setData] = useState<AttendanceMeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const out = await getMyAttendance({ from, to });
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendance");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = data?.summary ?? { present: 0, absent: 0, late: 0, total: 0 };

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" subtitle="Your attendance summary and session history." />

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
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
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <Alert tone="error" message={error} />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Present" value={summary.present} className="text-emerald-300" />
        <SummaryCard label="Late" value={summary.late} className="text-yellow-300" />
        <SummaryCard label="Absent" value={summary.absent} className="text-red-300" />
        <SummaryCard label="Total" value={summary.total} className="text-white" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Recent Sessions</div>
        <div className="mt-3 space-y-2">
          {(data?.value ?? []).length === 0 ? (
            <div className="text-sm text-slate-300">No attendance records in this range.</div>
          ) : (
            data!.value.map((row) => (
              <div
                key={`${row.sessionId}-${row.markedAt}`}
                className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-100">
                      {row.moduleCode} - {row.moduleName}
                    </div>
                    <div className="text-xs text-slate-400">
                      {row.date} | {row.facultyName}
                    </div>
                  </div>
                  <div className={["text-sm font-semibold", statusClass(row.status)].join(" ")}>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      {children}
    </div>
  );
}

function SummaryCard({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={["mt-2 text-2xl font-bold", className].join(" ")}>{value}</div>
    </div>
  );
}

function Alert({ tone, message }: { tone: "error" | "info"; message: string }) {
  const className =
    tone === "error"
      ? "border-red-700/40 bg-red-950/30 text-red-200"
      : "border-emerald-700/40 bg-emerald-950/30 text-emerald-200";

  return <div className={["rounded-xl border p-3 text-sm", className].join(" ")}>{message}</div>;
}
