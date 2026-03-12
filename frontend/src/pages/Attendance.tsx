// src/pages/Attendance.tsx
// Attendance page.
// Responsibilities:
// - Show lecturer/admin attendance tools
// - Show student attendance summary/history
// - Create attendance sessions
// - Mark attendance per session
// - Use consistent shared styles across views
// - Apply purple block styling for this section

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

/**
 * Return today's date in YYYY-MM-DD format.
 */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Return a date N days before today.
 */
function defaultFromDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/**
 * Color class for attendance status.
 */
function statusClass(status: AttendanceStatus): string {
  if (status === "PRESENT") return "text-emerald-600";
  if (status === "LATE") return "text-amber-600";
  return "text-red-600";
}

type MarkMap = Record<string, AttendanceStatus>;

function roleLabel(role: string): string {
  return String(role ?? "").toUpperCase();
}

/**
 * Sort students alphabetically for consistent attendance display.
 */
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

/**
 * Lecturer/Admin attendance view:
 * - create sessions
 * - load students
 * - mark attendance
 */
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

    const rows = await listAttendanceSessions({
      moduleId: currentModuleId,
      date: currentDate,
    });

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

  /**
   * Create a new attendance session.
   */
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

  /**
   * Submit attendance marks for the selected session.
   */
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
        {/* Create session panel */}
        <div className="glass-panel space-y-4 border-[#794DFA]/20 bg-[#794DFA]/08 p-5">
          <div className="text-lg font-semibold text-black">Create Session</div>

          <Field label="Module">
            <select
              id="attendance-module"
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              className="select-glass"
              title="Select module"
              aria-label="Select module"
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
                id="attendance-lecturer"
                value={lecturerId}
                onChange={(e) => setLecturerId(e.target.value)}
                className="select-glass"
                title="Select lecturer"
                aria-label="Select lecturer"
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
                id="attendance-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-glass"
                title="Attendance date"
                aria-label="Attendance date"
              />
            </Field>

            <Field label="Start (optional)">
              <input
                id="attendance-start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="input-glass"
                title="Attendance session start date and time"
                aria-label="Attendance session start date and time"
              />
            </Field>

            <Field label="End (optional)">
              <input
                id="attendance-end"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="input-glass"
                title="Attendance session end date and time"
                aria-label="Attendance session end date and time"
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={createSession}
            disabled={busy || !moduleId}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
            title="Create attendance session"
            aria-label="Create attendance session"
          >
            {busy ? "Creating..." : "Create Session"}
          </button>
        </div>

        {/* Mark attendance panel */}
        <div className="glass-panel space-y-4 border-[#794DFA]/20 bg-[#794DFA]/08 p-5">
          <div className="text-lg font-semibold text-black">
            Mark Attendance
          </div>

          <Field label="Session">
            <select
              id="attendance-session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="select-glass"
              title="Select attendance session"
              aria-label="Select attendance session"
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

          <div className="max-h-[420px] overflow-auto rounded-xl border border-[#794DFA]/18 bg-white">
            {students.length === 0 ? (
              <div className="p-4 text-sm text-black">
                No enrolled students for this module.
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-[#794DFA]/06 text-black">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Student</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const name =
                      `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() ||
                      s.email;

                    return (
                      <tr key={s.id} className="border-t border-[#DADDE2]">
                        <td className="px-3 py-2 text-black">
                          <div>{name}</div>
                          <div className="text-xs text-black">
                            {s.studentNumber ?? s.email}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            id={`attendance-status-${s.id}`}
                            value={marks[s.id] ?? "PRESENT"}
                            onChange={(e) =>
                              setMarks((prev) => ({
                                ...prev,
                                [s.id]: e.target.value as AttendanceStatus,
                              }))
                            }
                            className="select-glass px-2 py-1 text-sm"
                            title={`Attendance status for ${name}`}
                            aria-label={`Attendance status for ${name}`}
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
            className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
            title="Submit attendance"
            aria-label="Submit attendance"
          >
            {busy ? "Submitting..." : "Submit Attendance"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Student attendance summary/history view.
 */
function StudentAttendanceView() {
  const [from, setFrom] = useState(defaultFromDate(30));
  const [to, setTo] = useState(todayDate());
  const [data, setData] = useState<AttendanceMeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load attendance summary and history for the selected range.
   */
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

  const summary = data?.summary ?? {
    present: 0,
    absent: 0,
    late: 0,
    total: 0,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        subtitle="Your attendance summary and session history."
      />

      <div className="glass-panel border-[#794DFA]/20 bg-[#794DFA]/08 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            id="attendance-from-date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input-glass"
            title="Attendance from date"
            aria-label="Attendance from date"
          />

          <input
            id="attendance-to-date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input-glass"
            title="Attendance to date"
            aria-label="Attendance to date"
          />

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
            title="Refresh attendance"
            aria-label="Refresh attendance"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <Alert tone="error" message={error} />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Present"
          value={summary.present}
          className="text-emerald-600"
        />
        <SummaryCard
          label="Late"
          value={summary.late}
          className="text-amber-600"
        />
        <SummaryCard
          label="Absent"
          value={summary.absent}
          className="text-red-600"
        />
        <SummaryCard
          label="Total"
          value={summary.total}
          className="text-black"
        />
      </div>

      <div className="glass-panel border-[#794DFA]/20 bg-[#794DFA]/08 p-5">
        <div className="text-lg font-semibold text-black">Recent Sessions</div>

        <div className="mt-3 space-y-2">
          {(data?.value ?? []).length === 0 ? (
            <div className="text-sm text-black">
              No attendance records in this range.
            </div>
          ) : (
            data!.value.map((row) => (
              <div
                key={`${row.sessionId}-${row.markedAt}`}
                className="rounded-2xl border border-[#794DFA]/18 bg-white p-3 transition-all duration-200 hover:-translate-y-[1px] hover:border-[#794DFA]/35 hover:bg-[#794DFA]/06 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-black">
                      {row.moduleCode} - {row.moduleName}
                    </div>
                    <div className="text-xs text-black">
                      {row.date} | {row.facultyName}
                    </div>
                  </div>

                  <div
                    className={[
                      "text-sm font-semibold",
                      statusClass(row.status),
                    ].join(" ")}
                  >
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

/**
 * Shared field wrapper for stacked form controls.
 */
function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-black">
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * Summary stat card for student attendance.
 */
function SummaryCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="glass-panel border-[#794DFA]/20 bg-[#794DFA]/08 p-4">
      <div className="text-xs uppercase tracking-wide text-black">
        {label}
      </div>
      <div className={["mt-2 text-2xl font-bold", className].join(" ")}>
        {value}
      </div>
    </div>
  );
}

/**
 * Lightweight alert banner for local page notices.
 */
function Alert({
  tone,
  message,
}: {
  tone: "error" | "info";
  message: string;
}) {
  const className =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-[#794DFA]/20 bg-[#794DFA]/08 text-black";

  return (
    <div className={["rounded-2xl border p-3 text-sm", className].join(" ")}>
      {message}
    </div>
  );
}