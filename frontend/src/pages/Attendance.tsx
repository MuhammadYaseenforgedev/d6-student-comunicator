import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import {
  assignLecturerToAttendanceModule,
  checkInToAttendanceSession,
  createAttendanceModule,
  createAttendanceSession,
  enrollStudentInAttendanceModule,
  getMyAttendance,
  listAttendanceDirectoryUsers,
  listAttendanceModuleStudents,
  listAttendanceModules,
  listAttendanceSessionRoster,
  listAttendanceSessions,
  markAttendanceSession,
  removeLecturerFromAttendanceModule,
  removeStudentFromAttendanceModule,
  type AttendanceDirectoryUser,
  type AttendanceMeResponse,
  type AttendanceModule,
  type AttendanceModuleStudent,
  type AttendanceSession,
  type AttendanceSessionRosterStudent,
  type AttendanceStatus,
} from "../lib/attendanceApi";
import { listCourses, type CourseRecord } from "../lib/courseApi";

type MarkMap = Record<string, AttendanceStatus>;

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
  if (status === "LATE") return "text-amber-300";
  return "text-rose-300";
}

function roleLabel(role: string): string {
  return String(role ?? "").toUpperCase();
}

function sortStudents<
  T extends Pick<AttendanceModuleStudent, "email" | "firstName" | "lastName">
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aKey =
      `${a.lastName ?? ""} ${a.firstName ?? ""} ${a.email}`.toLowerCase();
    const bKey =
      `${b.lastName ?? ""} ${b.firstName ?? ""} ${b.email}`.toLowerCase();
    return aKey.localeCompare(bKey);
  });
}

function sortDirectoryUsers(
  rows: AttendanceDirectoryUser[]
): AttendanceDirectoryUser[] {
  return [...rows].sort((a, b) =>
    a.email.toLowerCase().localeCompare(b.email.toLowerCase())
  );
}

function studentDisplayName(student: AttendanceModuleStudent): string {
  return (
    `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || student.email
  );
}

function studentMeta(student: AttendanceModuleStudent): string {
  return student.studentNumber?.trim() || student.courseName?.trim() || student.email;
}

function formatDateTime(raw: string | null): string {
  if (!raw) return "Not recorded";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  return new Date(ms).toLocaleString();
}

export default function AttendancePage() {
  const user = getUser();
  const role = roleLabel(user?.role ?? "");
  if (role === "LECTURER" || role === "ADMIN") {
    return (
      <LecturerAttendanceView role={role} currentUserId={user?.id ?? ""} />
    );
  }
  if (role === "PARENT") return <Navigate to="/app/parent/attendance" replace />;
  return <StudentAttendanceView />;
}

function LecturerAttendanceView({
  role,
  currentUserId,
}: {
  role: "LECTURER" | "ADMIN";
  currentUserId: string;
}) {
  const [modules, setModules] = useState<AttendanceModule[]>([]);
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [moduleStudents, setModuleStudents] = useState<AttendanceModuleStudent[]>(
    []
  );
  const [rosterStudents, setRosterStudents] = useState<
    AttendanceSessionRosterStudent[]
  >([]);
  const [marks, setMarks] = useState<MarkMap>({});
  const [moduleId, setModuleId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [date, setDate] = useState(todayDate());
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [lecturerId, setLecturerId] = useState("");
  const [candidateStudents, setCandidateStudents] = useState<
    AttendanceDirectoryUser[]
  >([]);
  const [candidateLecturers, setCandidateLecturers] = useState<
    AttendanceDirectoryUser[]
  >([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedLecturerId, setSelectedLecturerId] = useState("");
  const [newModuleCode, setNewModuleCode] = useState("");
  const [newModuleName, setNewModuleName] = useState("");
  const [newFacultyName, setNewFacultyName] = useState("");
  const [newCourseId, setNewCourseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedModule = useMemo(
    () => modules.find((m) => m.id === moduleId) ?? null,
    [modules, moduleId]
  );

  const availableStudents = useMemo(() => {
    const enrolledIds = new Set(moduleStudents.map((student) => student.id));
    return candidateStudents.filter((student) => !enrolledIds.has(student.id));
  }, [candidateStudents, moduleStudents]);

  const availableLecturers = useMemo(() => {
    const assignedIds = new Set(
      (selectedModule?.lecturers ?? []).map((lecturer) => lecturer.id)
    );
    return candidateLecturers.filter(
      (lecturer) => !assignedIds.has(lecturer.id)
    );
  }, [candidateLecturers, selectedModule]);

  const assignedLecturerIds = useMemo(
    () => new Set((selectedModule?.lecturers ?? []).map((lecturer) => lecturer.id)),
    [selectedModule]
  );

  async function loadModules() {
    const rows = await listAttendanceModules();
    setModules(rows);
    if (!moduleId && rows[0]?.id) setModuleId(rows[0].id);
  }

  async function loadSessions(currentModuleId: string) {
    if (!currentModuleId) {
      setSessions([]);
      setSessionId("");
      return;
    }
    const rows = await listAttendanceSessions({ moduleId: currentModuleId });
    setSessions(rows);
    setSessionId((current) =>
      rows.some((row) => row.id === current) ? current : (rows[0]?.id ?? "")
    );
  }

  async function loadModuleStudents(currentModuleId: string) {
    if (!currentModuleId) {
      setModuleStudents([]);
      return;
    }
    setModuleStudents(
      sortStudents(await listAttendanceModuleStudents(currentModuleId))
    );
  }

  async function loadRoster(currentSessionId: string) {
    if (!currentSessionId) {
      setRosterStudents([]);
      setMarks({});
      return;
    }
    const rows = sortStudents(await listAttendanceSessionRoster(currentSessionId));
    setRosterStudents(rows);

    const nextMarks: MarkMap = {};
    for (const student of rows) {
      nextMarks[student.id] = student.currentStatus ?? student.suggestedStatus;
    }
    setMarks(nextMarks);
  }

  async function loadDirectoryUsers() {
    const [studentsRes, lecturersRes] = await Promise.all([
      listAttendanceDirectoryUsers({ roles: ["STUDENT"], limit: 500 }),
      listAttendanceDirectoryUsers({ roles: ["LECTURER"], limit: 500 }),
    ]);
    setCandidateStudents(sortDirectoryUsers(studentsRes));
    setCandidateLecturers(sortDirectoryUsers(lecturersRes));
  }

  async function loadCourses() {
    const rows = (await listCourses()).filter((course) => course.isActive);
    setCourses(rows);
    setNewCourseId((current) =>
      rows.some((course) => course.id === current) ? current : (rows[0]?.id ?? "")
    );
  }

  async function refreshCurrentModuleData(currentModuleId: string) {
    await Promise.all([
      loadModules(),
      loadModuleStudents(currentModuleId),
      loadSessions(currentModuleId),
    ]);
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadModules(), loadDirectoryUsers(), loadCourses()]);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to load attendance modules"
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!moduleId) return;
    setError(null);
    setInfo(null);
    setSessionId("");
    setRosterStudents([]);
    setMarks({});
    void loadModuleStudents(moduleId).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load module students");
    });
    void loadSessions(moduleId).catch((e: unknown) => {
      setError(
        e instanceof Error ? e.message : "Failed to load attendance sessions"
      );
    });
  }, [moduleId]);

  useEffect(() => {
    void loadRoster(sessionId).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load session roster");
    });
  }, [sessionId]);

  useEffect(() => {
    if (!candidateLecturers.length) {
      setLecturerId("");
      return;
    }
    const preferredLecturerId =
      role === "LECTURER" &&
      candidateLecturers.some((lecturer) => lecturer.id === currentUserId)
        ? currentUserId
        : selectedModule?.lecturers.find((lecturer) =>
            candidateLecturers.some((candidate) => candidate.id === lecturer.id)
          )?.id ?? "";

    setLecturerId((current) => {
      if (preferredLecturerId) return preferredLecturerId;
      return candidateLecturers.some((lecturer) => lecturer.id === current)
        ? current
        : candidateLecturers[0].id;
    });
  }, [candidateLecturers, currentUserId, role, selectedModule]);

  useEffect(() => {
    if (!availableStudents.length) {
      setSelectedStudentId("");
      return;
    }
    setSelectedStudentId((current) =>
      availableStudents.some((student) => student.id === current)
        ? current
        : availableStudents[0].id
    );
  }, [availableStudents]);

  useEffect(() => {
    if (!availableLecturers.length) {
      setSelectedLecturerId("");
      return;
    }
    setSelectedLecturerId((current) =>
      availableLecturers.some((lecturer) => lecturer.id === current)
        ? current
        : availableLecturers[0].id
    );
  }, [availableLecturers]);

  async function createSession() {
    if (!moduleId) return setError("Select a module first.");
    if (!lecturerId) return setError("Select a lecturer for this session.");

    try {
      setBusy(true);
      setError(null);
      setInfo(null);

      const created = await createAttendanceSession({
        moduleId,
        date,
        startsAt: startsAt || undefined,
        endsAt: endsAt || undefined,
        lecturerId,
      });

      setInfo(`Session created for ${created.date}.`);
      await refreshCurrentModuleData(moduleId);
      setSessionId(created.id);
      await loadRoster(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setBusy(false);
    }
  }

  async function createModule() {
    const code = newModuleCode.trim().toUpperCase();
    const name = newModuleName.trim();
    const facultyName = newFacultyName.trim();

    if (!newCourseId || !code || !name || !facultyName) {
      setError("Course, faculty name, module code, and module name are required.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);

      const created = await createAttendanceModule({
        courseId: newCourseId,
        code,
        name,
        facultyName,
      });
      setNewModuleCode("");
      setNewModuleName("");
      setNewFacultyName("");
      await loadModules();
      setModuleId(created.id);
      setInfo(`Module ${created.code} created.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create module");
    } finally {
      setBusy(false);
    }
  }

  async function submitMarks() {
    if (!sessionId) return setError("Select a session to mark.");
    if (rosterStudents.length === 0) {
      return setError("No enrolled students found for this session.");
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);

      const payload = rosterStudents.map((student) => ({
        studentId: student.id,
        status: marks[student.id] ?? "PRESENT",
      }));

      const result = await markAttendanceSession(sessionId, payload);
      setInfo(`Attendance submitted (${result.count} record(s)).`);
      await loadRoster(sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit attendance");
    } finally {
      setBusy(false);
    }
  }

  async function addStudentToModule() {
    if (!moduleId || !selectedStudentId) {
      return setError("Select a module and student first.");
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
      setError(
        e instanceof Error ? e.message : "Failed to remove student from module"
      );
    } finally {
      setBusy(false);
    }
  }

  async function addLecturerToModule() {
    if (!moduleId || !selectedLecturerId) {
      return setError("Select a module and lecturer first.");
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await assignLecturerToAttendanceModule(moduleId, selectedLecturerId);
      await refreshCurrentModuleData(moduleId);
      setInfo("Lecturer linked to module.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to link lecturer to module"
      );
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
      setError(
        e instanceof Error ? e.message : "Failed to remove lecturer from module"
      );
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
        <div className="teal-glow-card space-y-4 p-5">
          <div className="text-lg font-semibold text-white">Create Session</div>
          <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-3 text-sm text-white/75">
            Staff module selection is global. If the module you need does not
            exist yet, create it below and pick any lecturer directly from the
            full lecturer list. Each module must belong to a course.
          </div>

          <Field label="Module" htmlFor="attendance-module">
            <select
              id="attendance-module"
              title="Select attendance module"
              aria-label="Select attendance module"
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              className="select-glass"
            >
              {modules.length === 0 ? (
                <option value="">No modules available</option>
              ) : (
                modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} - {m.name} | {m.courseName} ({m.enrolledCount} students)
                  </option>
                ))
              )}
            </select>
          </Field>

          <Field label="Lecturer" htmlFor="attendance-lecturer">
            <select
              id="attendance-lecturer"
              title="Select lecturer"
              aria-label="Select lecturer"
              value={lecturerId}
              onChange={(e) => setLecturerId(e.target.value)}
              className="select-glass"
            >
              {candidateLecturers.length ? (
                candidateLecturers.map((lecturer) => (
                  <option key={lecturer.id} value={lecturer.id}>
                    {lecturer.email}
                    {assignedLecturerIds.has(lecturer.id)
                      ? " - assigned to module"
                      : " - will be linked on create"}
                  </option>
                ))
              ) : (
                <option value="">No lecturers available</option>
              )}
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Date" htmlFor="attendance-date">
              <input
                id="attendance-date"
                title="Attendance date"
                aria-label="Attendance date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-glass"
              />
            </Field>

            <Field label="Start (optional)" htmlFor="attendance-start">
              <input
                id="attendance-start"
                title="Attendance start date and time"
                aria-label="Attendance start date and time"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="input-glass"
              />
            </Field>

            <Field label="End (optional)" htmlFor="attendance-end">
              <input
                id="attendance-end"
                title="Attendance end date and time"
                aria-label="Attendance end date and time"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="input-glass"
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={createSession}
            disabled={busy || !moduleId}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            {busy ? "Creating..." : "Create Session"}
          </button>
        </div>

        <div className="teal-glow-card space-y-4 p-5">
          <div className="text-lg font-semibold text-white">Mark Attendance</div>

          <Field label="Session" htmlFor="attendance-session">
            <select
              id="attendance-session"
              title="Select attendance session"
              aria-label="Select attendance session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="select-glass"
            >
              {sessions.length === 0 ? (
                <option value="">No session for selected module</option>
              ) : (
                sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.date} - {session.moduleCode} {session.moduleName} (
                    {session.checkedInCount} checked in)
                  </option>
                ))
              )}
            </select>
          </Field>

          <div className="max-h-[420px] overflow-auto rounded-xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)]">
            {!sessionId ? (
              <div className="p-4 text-sm text-white/80">
                Select a session to load its attendance roster.
              </div>
            ) : rosterStudents.length === 0 ? (
              <div className="p-4 text-sm text-white/80">
                No enrolled students for this session.
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-[rgba(140,235,255,0.08)] text-white/85">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Student</th>
                    <th className="px-3 py-2 text-left font-medium">Check-in</th>
                    <th className="px-3 py-2 text-left font-medium">Suggested</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterStudents.map((student) => {
                    const name = studentDisplayName(student);
                    return (
                      <tr
                        key={student.id}
                        className="border-t border-[rgba(140,235,255,0.12)]"
                      >
                        <td className="px-3 py-2 text-white">
                          <div>{name}</div>
                          <div className="text-xs text-white/60">
                            {studentMeta(student)}
                          </div>
                        </td>

                        <td className="px-3 py-2 text-xs text-white/70">
                          {student.checkedInAt
                            ? formatDateTime(student.checkedInAt)
                            : "Not checked in"}
                        </td>

                        <td className="px-3 py-2 text-xs">
                          <span className={statusClass(student.suggestedStatus)}>
                            {student.suggestedStatus}
                          </span>
                        </td>

                        <td className="px-3 py-2">
                          <select
                            id={`attendance-status-${student.id}`}
                            title={`Attendance status for ${name}`}
                            aria-label={`Attendance status for ${name}`}
                            value={marks[student.id] ?? "PRESENT"}
                            onChange={(e) =>
                              setMarks((prev) => ({
                                ...prev,
                                [student.id]: e.target.value as AttendanceStatus,
                              }))
                            }
                            className="select-glass px-2 py-1 text-sm"
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
            disabled={busy || !sessionId || rosterStudents.length === 0}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            {busy ? "Submitting..." : "Submit Attendance"}
          </button>
        </div>
      </div>

      <div className="teal-glow-card space-y-4 p-5">
        <div>
          <div className="text-lg font-semibold text-white">Module Setup</div>
          <div className="mt-1 text-sm text-white/72">
            Create attendance modules here so they appear in the global module
            picker immediately. Modules must be attached to a course first.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <Field label="Course" htmlFor="attendance-course-id">
            <select
              id="attendance-course-id"
              title="Module course"
              aria-label="Module course"
              value={newCourseId}
              onChange={(e) => setNewCourseId(e.target.value)}
              className="select-glass"
            >
              {courses.length === 0 ? (
                <option value="">No courses available</option>
              ) : (
                courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {course.name}
                  </option>
                ))
              )}
            </select>
          </Field>

          <Field label="Faculty name" htmlFor="attendance-faculty-name">
            <input
              id="attendance-faculty-name"
              title="Faculty name"
              aria-label="Faculty name"
              value={newFacultyName}
              onChange={(e) => setNewFacultyName(e.target.value)}
              placeholder="Faculty of Science"
              className="input-glass"
            />
          </Field>

          <Field label="Module code" htmlFor="attendance-module-code">
            <input
              id="attendance-module-code"
              title="Module code"
              aria-label="Module code"
              value={newModuleCode}
              onChange={(e) => setNewModuleCode(e.target.value.toUpperCase())}
              placeholder="CS102"
              className="input-glass"
            />
          </Field>

          <Field label="Module name" htmlFor="attendance-module-name">
            <input
              id="attendance-module-name"
              title="Module name"
              aria-label="Module name"
              value={newModuleName}
              onChange={(e) => setNewModuleName(e.target.value)}
              placeholder="Data Structures"
              className="input-glass"
            />
          </Field>
        </div>

        <button
          type="button"
          onClick={createModule}
          disabled={busy}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          {busy ? "Saving..." : "Create module"}
        </button>
      </div>

      <div className="teal-glow-card space-y-4 p-5">
        <div>
          <div className="text-lg font-semibold text-white">
            Module Membership
          </div>
          <div className="mt-1 text-sm text-white/72">
            Students must be linked to a module before they can see or join its
            attendance sessions, and they must already be enrolled in the
            module's parent course. Their session check-in time appears in the
            roster for staff marking.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-4">
            <div className="text-sm font-semibold text-white">
              Assigned lecturers
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <select
                id="attendance-assigned-lecturer"
                title="Select lecturer to add to module"
                aria-label="Select lecturer to add to module"
                value={selectedLecturerId}
                onChange={(e) => setSelectedLecturerId(e.target.value)}
                disabled={busy || !moduleId || availableLecturers.length === 0}
                className="select-glass"
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
                className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
              >
                Add lecturer
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {(selectedModule?.lecturers ?? []).length === 0 ? (
                <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.52)] p-3 text-sm text-white/75">
                  No lecturers assigned to this module yet.
                </div>
              ) : (
                selectedModule!.lecturers.map((lecturer) => (
                  <div
                    key={lecturer.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.52)] p-3"
                  >
                    <div className="text-sm text-white">{lecturer.email}</div>
                    <button
                      type="button"
                      onClick={() => void removeLecturerFromModule(lecturer.id)}
                      disabled={busy}
                      className="btn-danger px-3 py-1 text-xs disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-4">
            <div className="text-sm font-semibold text-white">
              Enrolled students
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <select
                id="attendance-enrolled-student"
                title="Select student to add to module"
                aria-label="Select student to add to module"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                disabled={busy || !moduleId || availableStudents.length === 0}
                className="select-glass"
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
                className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
              >
                Add student
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {moduleStudents.length === 0 ? (
                <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.52)] p-3 text-sm text-white/75">
                  No students linked to this module yet.
                </div>
              ) : (
                moduleStudents.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.52)] p-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-white">
                        {studentDisplayName(student)}
                      </div>
                      <div className="text-xs text-white/60">
                        {studentMeta(student)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeStudentFromModule(student.id)}
                      disabled={busy}
                      className="btn-danger px-3 py-1 text-xs disabled:opacity-60"
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
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedModule = useMemo(
    () => modules.find((module) => module.id === selectedModuleId) ?? null,
    [modules, selectedModuleId]
  );

  async function loadModuleSessions(currentModuleId: string) {
    if (!currentModuleId) {
      setSessions([]);
      return;
    }
    setSessions(await listAttendanceSessions({ moduleId: currentModuleId }));
  }

  async function loadAttendanceView() {
    try {
      setLoading(true);
      setError(null);
      setInfo(null);

      const [attendance, moduleRows] = await Promise.all([
        getMyAttendance({ from, to }),
        listAttendanceModules(),
      ]);

      setData(attendance);
      setModules(moduleRows);

      const nextModuleId = moduleRows.some(
        (module) => module.id === selectedModuleId
      )
        ? selectedModuleId
        : (moduleRows[0]?.id ?? "");

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

  async function onCheckIn(sessionId: string) {
    try {
      setBusySessionId(sessionId);
      setError(null);
      setInfo(null);

      const result = await checkInToAttendanceSession(sessionId);
      setInfo(
        result.created
          ? `Session check-in recorded at ${formatDateTime(result.checkedInAt)}.`
          : `You already checked in at ${formatDateTime(result.checkedInAt)}.`
      );

      await loadModuleSessions(selectedModuleId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join attendance session");
    } finally {
      setBusySessionId(null);
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
      setError(
        e instanceof Error ? e.message : "Failed to load attendance sessions"
      );
    });
  }, [selectedModuleId]);

  const summary = data?.summary ?? { present: 0, absent: 0, late: 0, total: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        subtitle="Your attendance summary and session history."
      />

      <div className="teal-glow-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            id="attendance-from-date"
            title="Attendance from date"
            aria-label="Attendance from date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input-glass"
          />
          <input
            id="attendance-to-date"
            title="Attendance to date"
            aria-label="Attendance to date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input-glass"
          />
          <button
            type="button"
            onClick={() => void loadAttendanceView()}
            disabled={loading}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <Alert tone="error" message={error} />}
      {info && <Alert tone="info" message={info} />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Present"
          value={summary.present}
          className="text-emerald-300"
        />
        <SummaryCard
          label="Late"
          value={summary.late}
          className="text-amber-300"
        />
        <SummaryCard
          label="Absent"
          value={summary.absent}
          className="text-rose-300"
        />
        <SummaryCard label="Total" value={summary.total} className="text-white" />
      </div>

      <Alert
        tone="info"
        message="When your lecturer creates a session for one of your modules, join it here to record your check-in time. Your lecturer or admin still chooses the final attendance status."
      />

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">
          Your enrolled modules
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {modules.length === 0 ? (
            <div className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-4 text-sm text-white/80">
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
                    "rounded-3xl border p-4 text-left transition-all duration-200",
                    isSelected
                      ? "border-[rgba(140,235,255,0.34)] bg-[rgba(14,42,99,0.62)] shadow-[0_0_18px_rgba(140,235,255,0.10)]"
                      : "border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.28)] hover:bg-[rgba(10,27,67,0.68)]",
                  ].join(" ")}
                >
                  <div className="font-semibold text-white">
                    {module.code} - {module.name}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {module.facultyName} | {module.courseName}
                  </div>
                  <div className="mt-3 text-xs text-white/70">
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

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">
          Sessions for selected module
        </div>
        <div className="mt-1 text-sm text-white/72">
          {selectedModule
            ? `${selectedModule.code} - ${selectedModule.name}`
            : "Select a module to view sessions."}
        </div>

        <div className="mt-3 space-y-2">
          {!selectedModule ? (
            <div className="text-sm text-white/75">No module selected.</div>
          ) : sessions.length === 0 ? (
            <div className="text-sm text-white/75">
              No attendance sessions created for this module yet.
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.34)] hover:bg-[rgba(14,42,99,0.62)] hover:shadow-[0_0_18px_rgba(140,235,255,0.10)]"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold text-white">
                      {session.date} | {session.moduleCode} - {session.moduleName}
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      {session.startsAt
                        ? `Starts: ${formatDateTime(session.startsAt)}`
                        : "Start time not set"}
                      {session.endsAt
                        ? ` | Ends: ${formatDateTime(session.endsAt)}`
                        : ""}
                    </div>
                    <div className="mt-1 text-xs text-white/70">
                      {session.checkedInAt
                        ? `Checked in: ${formatDateTime(session.checkedInAt)}`
                        : "You have not checked in yet."}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void onCheckIn(session.id)}
                    disabled={
                      busySessionId === session.id || Boolean(session.checkedInAt)
                    }
                    className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {session.checkedInAt
                      ? "Checked in"
                      : busySessionId === session.id
                      ? "Joining..."
                      : "Join session"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="teal-glow-card p-5">
        <div className="text-lg font-semibold text-white">Recent Sessions</div>
        <div className="mt-3 space-y-2">
          {(data?.value ?? []).length === 0 ? (
            <div className="text-sm text-white/75">
              No attendance records in this range.
            </div>
          ) : (
            data!.value.map((row) => (
              <div
                key={`${row.sessionId}-${row.markedAt}`}
                className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.34)] hover:bg-[rgba(14,42,99,0.62)] hover:shadow-[0_0_18px_rgba(140,235,255,0.10)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">
                      {row.moduleCode} - {row.moduleName}
                    </div>
                    <div className="text-xs text-white/60">
                      {row.date} | {row.facultyName}
                    </div>
                  </div>
                  <div
                    className={["text-sm font-semibold", statusClass(row.status)].join(
                      " "
                    )}
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

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/72"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

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
    <div className="teal-glow-card p-4">
      <div className="text-xs uppercase tracking-wide text-white/65">{label}</div>
      <div className={["mt-2 text-2xl font-bold", className].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function Alert({
  tone,
  message,
}: {
  tone: "error" | "info";
  message: string;
}) {
  const className =
    tone === "error"
      ? "border-[rgba(255,94,130,0.22)] bg-[rgba(74,10,31,0.72)] text-[#ffe1e8]"
      : "border-[rgba(140,235,255,0.22)] bg-[rgba(12,31,78,0.70)] text-white";

  return (
    <div className={["rounded-2xl border p-3 text-sm", className].join(" ")}>
      {message}
    </div>
  );
}
