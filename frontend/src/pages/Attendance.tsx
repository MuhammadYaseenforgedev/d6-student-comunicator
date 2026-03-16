import { type ReactNode, useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import {
  assignLecturerToAttendanceModule,
  createAttendanceSession,
  enrollStudentInAttendanceModule,
  getMyAttendance,
  listAttendanceDirectoryUsers,
  listAttendanceModuleStudents,
  listAttendanceModules,
  listAttendanceSessions,
  markAttendanceSession,
  removeLecturerFromAttendanceModule,
  removeStudentFromAttendanceModule,
  type AttendanceDirectoryUser,
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

function sortDirectoryUsers(rows: AttendanceDirectoryUser[]): AttendanceDirectoryUser[] {
  return [...rows].sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()));
}

function studentDisplayName(student: AttendanceModuleStudent): string {
  return `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || student.email;
}

function studentMeta(student: AttendanceModuleStudent): string {
  return student.studentNumber?.trim() || student.courseName?.trim() || student.email;
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
  const [candidateStudents, setCandidateStudents] = useState<AttendanceDirectoryUser[]>([]);
  const [candidateLecturers, setCandidateLecturers] = useState<AttendanceDirectoryUser[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedLecturerId, setSelectedLecturerId] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedModule = useMemo(
    () => modules.find((m) => m.id === moduleId) ?? null,
    [modules, moduleId]
  );
  const availableStudents = useMemo(() => {
    const enrolledIds = new Set(students.map((student) => student.id));
    return candidateStudents.filter((student) => !enrolledIds.has(student.id));
  }, [candidateStudents, students]);
  const availableLecturers = useMemo(() => {
    const assignedIds = new Set((selectedModule?.lecturers ?? []).map((lecturer) => lecturer.id));
    return candidateLecturers.filter((lecturer) => !assignedIds.has(lecturer.id));
  }, [candidateLecturers, selectedModule]);

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

  async function loadDirectoryUsers() {
    const [studentsRes, lecturersRes] = await Promise.all([
      listAttendanceDirectoryUsers({ roles: ["STUDENT"], limit: 100 }),
      role === "ADMIN"
        ? listAttendanceDirectoryUsers({ roles: ["LECTURER"], limit: 100 })
        : Promise.resolve([]),
    ]);
    setCandidateStudents(sortDirectoryUsers(studentsRes));
    setCandidateLecturers(sortDirectoryUsers(lecturersRes));
  }

  async function refreshCurrentModuleData(currentModuleId: string) {
    await Promise.all([
      loadModules(),
      loadStudents(currentModuleId),
      loadSessions(currentModuleId, date),
    ]);
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadModules(), loadDirectoryUsers()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load attendance modules");
      }
    })();
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

  useEffect(() => {
    if (!availableStudents.length) {
      setSelectedStudentId("");
      return;
    }
    setSelectedStudentId((current) =>
      availableStudents.some((student) => student.id === current) ? current : availableStudents[0].id
    );
  }, [availableStudents]);

  useEffect(() => {
    if (role !== "ADMIN") return;
    if (!availableLecturers.length) {
      setSelectedLecturerId("");
      return;
    }
    setSelectedLecturerId((current) =>
      availableLecturers.some((lecturer) => lecturer.id === current) ? current : availableLecturers[0].id
    );
  }, [availableLecturers, role]);

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

  async function addStudentToModule() {
    if (!moduleId || !selectedStudentId) {
      setError("Select a module and student first.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await enrollStudentInAttendanceModule(moduleId, selectedStudentId);
      await refreshCurrentModuleData(moduleId);
      setInfo("Student linked to module.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link student to module");
    } finally {
      setBusy(false);
    }
  }

  async function removeStudentFromModule(studentId: string) {
    if (!moduleId) return;

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await removeStudentFromAttendanceModule(moduleId, studentId);
      await refreshCurrentModuleData(moduleId);
      setInfo("Student removed from module.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove student from module");
    } finally {
      setBusy(false);
    }
  }

  async function addLecturerToModule() {
    if (!moduleId || !selectedLecturerId) {
      setError("Select a module and lecturer first.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await assignLecturerToAttendanceModule(moduleId, selectedLecturerId);
      await refreshCurrentModuleData(moduleId);
      setInfo("Lecturer linked to module.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link lecturer to module");
    } finally {
      setBusy(false);
    }
  }

  async function removeLecturerFromModule(assignedLecturerId: string) {
    if (!moduleId) return;

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await removeLecturerFromAttendanceModule(moduleId, assignedLecturerId);
      await refreshCurrentModuleData(moduleId);
      setInfo("Lecturer removed from module.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove lecturer from module");
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

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
        <div>
          <div className="text-lg font-semibold text-white">Module Membership</div>
          <div className="mt-1 text-sm text-slate-400">
            Students do not join attendance sessions manually. Once they are linked to a module, they appear here for
            the lecturer or admin to mark when a session is created.
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-6 ${role === "ADMIN" ? "xl:grid-cols-2" : ""}`}>
          {role === "ADMIN" && (
            <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-sm font-semibold text-white">Assigned lecturers</div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                <select
                  value={selectedLecturerId}
                  onChange={(e) => setSelectedLecturerId(e.target.value)}
                  disabled={busy || !moduleId || availableLecturers.length === 0}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                >
                  {availableLecturers.length === 0 ? (
                    <option value="">No additional lecturers available</option>
                  ) : (
                    availableLecturers.map((lecturer) => (
                      <option key={lecturer.id} value={lecturer.id}>
                        {lecturer.email}
                      </option>
                    ))
                  )}
                </select>

                <button
                  type="button"
                  onClick={addLecturerToModule}
                  disabled={busy || !moduleId || !selectedLecturerId}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  Add lecturer
                </button>
              </div>

              <div className="space-y-2">
                {(selectedModule?.lecturers ?? []).length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-300">
                    No lecturers assigned to this module yet.
                  </div>
                ) : (
                  selectedModule!.lecturers.map((lecturer) => (
                    <div
                      key={lecturer.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/30 p-3"
                    >
                      <div className="text-sm text-slate-200">{lecturer.email}</div>
                      <button
                        type="button"
                        onClick={() => {
                          void removeLecturerFromModule(lecturer.id);
                        }}
                        disabled={busy}
                        className="rounded-lg border border-red-700/40 bg-red-950/30 px-3 py-1 text-xs font-semibold text-red-200 hover:bg-red-950/50 disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold text-white">Enrolled students</div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                disabled={busy || !moduleId || availableStudents.length === 0}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              >
                {availableStudents.length === 0 ? (
                  <option value="">No additional students available</option>
                ) : (
                  availableStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.email}
                    </option>
                  ))
                )}
              </select>

              <button
                type="button"
                onClick={addStudentToModule}
                disabled={busy || !moduleId || !selectedStudentId}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                Add student
              </button>
            </div>

            <div className="space-y-2">
              {students.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-300">
                  No students linked to this module yet.
                </div>
              ) : (
                students.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/30 p-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-100">{studentDisplayName(student)}</div>
                      <div className="text-xs text-slate-400">{studentMeta(student)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void removeStudentFromModule(student.id);
                      }}
                      disabled={busy}
                      className="rounded-lg border border-red-700/40 bg-red-950/30 px-3 py-1 text-xs font-semibold text-red-200 hover:bg-red-950/50 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentAttendanceView() {
  const [from, setFrom] = useState(defaultFromDate(30));
  const [to, setTo] = useState(todayDate());
  const [data, setData] = useState<AttendanceMeResponse | null>(null);
  const [modules, setModules] = useState<AttendanceModule[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModule = useMemo(
    () => modules.find((module) => module.id === selectedModuleId) ?? null,
    [modules, selectedModuleId]
  );

  async function loadModuleSessions(currentModuleId: string) {
    if (!currentModuleId) {
      setSessions([]);
      return;
    }
    const rows = await listAttendanceSessions({ moduleId: currentModuleId });
    setSessions(rows);
  }

  async function loadAttendanceView() {
    try {
      setLoading(true);
      setError(null);
      const [attendance, moduleRows] = await Promise.all([
        getMyAttendance({ from, to }),
        listAttendanceModules(),
      ]);
      setData(attendance);
      setModules(moduleRows);
      const nextModuleId =
        moduleRows.some((module) => module.id === selectedModuleId) ? selectedModuleId : (moduleRows[0]?.id ?? "");
      setSelectedModuleId(nextModuleId);
      await loadModuleSessions(nextModuleId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendance");
      setData(null);
      setModules([]);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAttendanceView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedModuleId) {
      setSessions([]);
      return;
    }
    void loadModuleSessions(selectedModuleId).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load attendance sessions");
    });
  }, [selectedModuleId]);

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
            onClick={() => {
              void loadAttendanceView();
            }}
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

      <Alert
        tone="info"
        message="You do not join attendance sessions manually. If you are enrolled in a module, your lecturer or admin can create sessions for that module and mark your attendance there."
      />

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Your enrolled modules</div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {modules.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
              No modules linked to your account yet.
            </div>
          ) : (
            modules.map((module) => {
              const isSelected = module.id === selectedModuleId;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setSelectedModuleId(module.id)}
                  className={[
                    "rounded-2xl border p-4 text-left transition",
                    isSelected
                      ? "border-cyan-400/40 bg-cyan-500/10"
                      : "border-slate-800 bg-slate-950/40 hover:border-slate-700",
                  ].join(" ")}
                >
                  <div className="font-semibold text-slate-100">
                    {module.code} - {module.name}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{module.facultyName}</div>
                  <div className="mt-3 text-xs text-slate-300">
                    Lecturers:{" "}
                    {module.lecturers.length > 0
                      ? module.lecturers.map((lecturer) => lecturer.email).join(", ")
                      : "Not assigned yet"}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="text-lg font-semibold text-white">Sessions for selected module</div>
        <div className="mt-1 text-sm text-slate-400">
          {selectedModule ? `${selectedModule.code} - ${selectedModule.name}` : "Select a module to view sessions."}
        </div>
        <div className="mt-3 space-y-2">
          {!selectedModule ? (
            <div className="text-sm text-slate-300">No module selected.</div>
          ) : sessions.length === 0 ? (
            <div className="text-sm text-slate-300">No attendance sessions created for this module yet.</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-200"
              >
                <div className="font-semibold">
                  {session.date} | {session.moduleCode} - {session.moduleName}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {session.startsAt ? `Starts: ${session.startsAt}` : "Start time not set"}
                  {session.endsAt ? ` | Ends: ${session.endsAt}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
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
