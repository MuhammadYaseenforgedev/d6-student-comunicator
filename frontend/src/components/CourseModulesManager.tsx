import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  assignLecturerToAttendanceModule,
  createAttendanceModule,
  enrollStudentInAttendanceModule,
  listAttendanceDirectoryUsers,
  listAttendanceModuleStudents,
  listAttendanceModules,
  removeLecturerFromAttendanceModule,
  removeStudentFromAttendanceModule,
  type AttendanceDirectoryUser,
  type AttendanceModule,
  type AttendanceModuleStudent,
} from "../lib/attendanceApi";
import type { CourseRecord } from "../lib/courseApi";

type CourseModulesManagerProps = {
  courses: CourseRecord[];
  selectedCourseId?: string;
  selectedModuleId?: string;
  eligibleStudentIds?: string[];
  showModuleSelector?: boolean;
  title?: string;
  subtitle?: string;
  idPrefix?: string;
  onSelectedModuleIdChange?: (moduleId: string) => void;
  onChanged?: () => Promise<void> | void;
};

function sortDirectoryUsers(rows: AttendanceDirectoryUser[]): AttendanceDirectoryUser[] {
  return [...rows].sort((a, b) =>
    a.email.toLowerCase().localeCompare(b.email.toLowerCase())
  );
}

function sortStudents<T extends Pick<AttendanceModuleStudent, "email" | "firstName" | "lastName">>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const aKey = `${a.lastName ?? ""} ${a.firstName ?? ""} ${a.email}`.toLowerCase();
    const bKey = `${b.lastName ?? ""} ${b.firstName ?? ""} ${b.email}`.toLowerCase();
    return aKey.localeCompare(bKey);
  });
}

function studentDisplayName(student: AttendanceModuleStudent): string {
  return `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || student.email;
}

function studentMeta(student: AttendanceModuleStudent): string {
  return student.studentNumber?.trim() || student.courseName?.trim() || student.email;
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

export default function CourseModulesManager({
  courses,
  selectedCourseId,
  selectedModuleId,
  eligibleStudentIds,
  showModuleSelector = true,
  title = "Modules",
  subtitle = "Create modules and manage lecturer plus learner membership for the selected course.",
  idPrefix = "course-modules",
  onSelectedModuleIdChange,
  onChanged,
}: CourseModulesManagerProps) {
  const [modules, setModules] = useState<AttendanceModule[]>([]);
  const [moduleStudents, setModuleStudents] = useState<AttendanceModuleStudent[]>([]);
  const [candidateStudents, setCandidateStudents] = useState<AttendanceDirectoryUser[]>([]);
  const [candidateLecturers, setCandidateLecturers] = useState<AttendanceDirectoryUser[]>([]);
  const [internalModuleId, setInternalModuleId] = useState("");
  const [createCourseId, setCreateCourseId] = useState(selectedCourseId ?? "");
  const [newFacultyName, setNewFacultyName] = useState("");
  const [newModuleCode, setNewModuleCode] = useState("");
  const [newModuleName, setNewModuleName] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedLecturerId, setSelectedLecturerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  );

  const filteredModules = useMemo(() => {
    if (!selectedCourseId) return modules;
    return modules.filter((module) => module.courseId === selectedCourseId);
  }, [modules, selectedCourseId]);

  const activeModuleId = showModuleSelector ? internalModuleId : (selectedModuleId ?? "");
  const selectedModule = useMemo(
    () => filteredModules.find((module) => module.id === activeModuleId) ?? null,
    [activeModuleId, filteredModules]
  );

  const eligibleStudentIdSet = useMemo(
    () => (eligibleStudentIds ? new Set(eligibleStudentIds) : null),
    [eligibleStudentIds]
  );

  const studentPool = useMemo(() => {
    if (!eligibleStudentIdSet) return candidateStudents;
    return candidateStudents.filter((student) => eligibleStudentIdSet.has(student.id));
  }, [candidateStudents, eligibleStudentIdSet]);

  const availableStudents = useMemo(() => {
    const enrolledIds = new Set(moduleStudents.map((student) => student.id));
    return studentPool.filter((student) => !enrolledIds.has(student.id));
  }, [moduleStudents, studentPool]);

  const visibleModuleStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return moduleStudents;
    return moduleStudents.filter((student) => {
      const haystack = [
        studentDisplayName(student),
        studentMeta(student),
        student.email,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [moduleStudents, studentSearch]);

  const availableLecturers = useMemo(() => {
    const assignedIds = new Set((selectedModule?.lecturers ?? []).map((lecturer) => lecturer.id));
    return candidateLecturers.filter((lecturer) => !assignedIds.has(lecturer.id));
  }, [candidateLecturers, selectedModule]);

  async function loadModules() {
    setModules(await listAttendanceModules());
  }

  async function loadModuleStudents(moduleId: string) {
    if (!moduleId) {
      setModuleStudents([]);
      return;
    }
    setModuleStudents(sortStudents(await listAttendanceModuleStudents(moduleId)));
  }

  async function loadDirectoryUsers() {
    const [studentsRes, lecturersRes] = await Promise.all([
      listAttendanceDirectoryUsers({ roles: ["STUDENT"], limit: 500 }),
      listAttendanceDirectoryUsers({ roles: ["LECTURER"], limit: 500 }),
    ]);
    setCandidateStudents(sortDirectoryUsers(studentsRes));
    setCandidateLecturers(sortDirectoryUsers(lecturersRes));
  }

  async function refreshModuleData(nextModuleId?: string) {
    await loadModules();
    const moduleIdToLoad = nextModuleId ?? activeModuleId;
    if (moduleIdToLoad) {
      await loadModuleStudents(moduleIdToLoad);
    } else {
      setModuleStudents([]);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadModules(), loadDirectoryUsers()]);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to load module management data"
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedCourseId) {
      setCreateCourseId(selectedCourseId);
      return;
    }
    setCreateCourseId((current) =>
      courses.some((course) => course.id === current) ? current : (courses[0]?.id ?? "")
    );
  }, [courses, selectedCourseId]);

  useEffect(() => {
    if (!showModuleSelector) return;
    setInternalModuleId((current) =>
      filteredModules.some((module) => module.id === current)
        ? current
        : (filteredModules[0]?.id ?? "")
    );
  }, [filteredModules, showModuleSelector]);

  useEffect(() => {
    if (!showModuleSelector || !onSelectedModuleIdChange) return;
    onSelectedModuleIdChange(activeModuleId);
  }, [activeModuleId, onSelectedModuleIdChange, showModuleSelector]);

  useEffect(() => {
    if (!showModuleSelector) return;
    if (selectedModuleId === undefined) return;
    setInternalModuleId(selectedModuleId);
  }, [selectedModuleId, showModuleSelector]);

  useEffect(() => {
    if (!activeModuleId) {
      setModuleStudents([]);
      return;
    }
    void loadModuleStudents(activeModuleId).catch((e: unknown) => {
      setError(
        e instanceof Error ? e.message : "Failed to load module learners"
      );
    });
  }, [activeModuleId]);

  useEffect(() => {
    setSelectedStudentId((current) =>
      availableStudents.some((student) => student.id === current)
        ? current
        : (availableStudents[0]?.id ?? "")
    );
  }, [availableStudents]);

  useEffect(() => {
    setSelectedLecturerId((current) =>
      availableLecturers.some((lecturer) => lecturer.id === current)
        ? current
        : (availableLecturers[0]?.id ?? "")
    );
  }, [availableLecturers]);

  async function notifyChanged() {
    if (onChanged) {
      await onChanged();
    }
  }

  async function onCreateModule() {
    const courseId = selectedCourseId ?? createCourseId;
    const code = newModuleCode.trim().toUpperCase();
    const name = newModuleName.trim();
    const facultyName = newFacultyName.trim();

    if (!courseId || !code || !name || !facultyName) {
      setError("Course, faculty name, module code, and module name are required.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);

      const created = await createAttendanceModule({
        courseId,
        code,
        name,
        facultyName,
      });

      setNewFacultyName("");
      setNewModuleCode("");
      setNewModuleName("");

      if (showModuleSelector) {
        setInternalModuleId(created.id);
      }
      onSelectedModuleIdChange?.(created.id);

      await refreshModuleData(created.id);
      await notifyChanged();
      setInfo(`Module ${created.code} created.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create module");
    } finally {
      setBusy(false);
    }
  }

  async function onAddLecturer() {
    if (!activeModuleId || !selectedLecturerId) {
      setError("Select a module and lecturer first.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await assignLecturerToAttendanceModule(activeModuleId, selectedLecturerId);
      await refreshModuleData(activeModuleId);
      await notifyChanged();
      setInfo("Lecturer linked to module.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link lecturer to module");
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveLecturer(lecturerId: string) {
    if (!activeModuleId) return;
    const confirmed = window.confirm("Remove this lecturer from the selected module?");
    if (!confirmed) return;

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await removeLecturerFromAttendanceModule(activeModuleId, lecturerId);
      await refreshModuleData(activeModuleId);
      await notifyChanged();
      setInfo("Lecturer removed from module.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to remove lecturer from module"
      );
    } finally {
      setBusy(false);
    }
  }

  async function onAddStudent() {
    if (!activeModuleId || !selectedStudentId) {
      setError("Select a module and learner first.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await enrollStudentInAttendanceModule(activeModuleId, selectedStudentId);
      await refreshModuleData(activeModuleId);
      await notifyChanged();
      setInfo("Learner linked to module.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link learner to module");
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveStudent(studentId: string) {
    if (!activeModuleId) return;
    const confirmed = window.confirm("Remove this learner from the selected module?");
    if (!confirmed) return;

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await removeStudentFromAttendanceModule(activeModuleId, studentId);
      await refreshModuleData(activeModuleId);
      await notifyChanged();
      setInfo("Learner removed from module.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to remove learner from module"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="teal-glow-card space-y-4 p-5">
        <div>
          <div className="text-lg font-semibold text-white">{title}</div>
          <div className="mt-1 text-sm text-white/72">{subtitle}</div>
          <div className="mt-3 rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] p-3 text-sm text-white/75">
            One course can have multiple modules. Each module must use its own
            unique code.
          </div>
        </div>

        {error && <Alert tone="error" message={error} />}
        {info && <Alert tone="info" message={info} />}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {selectedCourse ? (
            <div className="lg:col-span-1">
              <div className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/72">
                Course
              </div>
              <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] px-4 py-3 text-sm text-white">
                {selectedCourse.code} - {selectedCourse.name}
              </div>
            </div>
          ) : (
            <Field label="Course" htmlFor={`${idPrefix}-course-id`}>
              <select
                id={`${idPrefix}-course-id`}
                title="Module course"
                aria-label="Module course"
                value={createCourseId}
                onChange={(e) => setCreateCourseId(e.target.value)}
                disabled={courses.length === 0}
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
          )}

          <Field label="Faculty name" htmlFor={`${idPrefix}-faculty-name`}>
            <input
              id={`${idPrefix}-faculty-name`}
              title="Faculty name"
              aria-label="Faculty name"
              value={newFacultyName}
              onChange={(e) => setNewFacultyName(e.target.value)}
              placeholder="Faculty of Science"
              className="input-glass"
            />
          </Field>

          <Field label="Module code" htmlFor={`${idPrefix}-module-code`}>
            <input
              id={`${idPrefix}-module-code`}
              title="Module code"
              aria-label="Module code"
              value={newModuleCode}
              onChange={(e) => setNewModuleCode(e.target.value.toUpperCase())}
              placeholder="CS102"
              className="input-glass"
            />
          </Field>

          <Field label="Module name" htmlFor={`${idPrefix}-module-name`}>
            <input
              id={`${idPrefix}-module-name`}
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
          onClick={() => void onCreateModule()}
          disabled={busy}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          {busy ? "Saving..." : "Create module"}
        </button>
      </div>

      <div className="teal-glow-card space-y-4 p-5">
        <div>
          <div className="text-lg font-semibold text-white">Module Membership</div>
          <div className="mt-1 text-sm text-white/72">
            Assign lecturers and learners to a module. Learners must already be
            enrolled in the parent course before they can be linked here.
          </div>
        </div>

        {showModuleSelector ? (
          <Field label="Module" htmlFor={`${idPrefix}-module-id`}>
            <select
              id={`${idPrefix}-module-id`}
              title="Select module"
              aria-label="Select module"
              value={activeModuleId}
              onChange={(e) => setInternalModuleId(e.target.value)}
              disabled={filteredModules.length === 0}
              className="select-glass"
            >
              {filteredModules.length === 0 ? (
                <option value="">No modules available for this course</option>
              ) : (
                filteredModules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.code} - {module.name}
                  </option>
                ))
              )}
            </select>
          </Field>
        ) : (
          <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] p-3 text-sm text-white/75">
            {selectedModule
              ? `Managing ${selectedModule.code} - ${selectedModule.name}. ${selectedModule.enrolledCount} learner(s) are currently linked to this module.`
              : "Select a module above to manage lecturer and learner membership."}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">Assigned lecturers</div>
              <div className="rounded-full border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
                {(selectedModule?.lecturers ?? []).length} linked
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <select
                id={`${idPrefix}-assigned-lecturer`}
                title="Select lecturer to add to module"
                aria-label="Select lecturer to add to module"
                value={selectedLecturerId}
                onChange={(e) => setSelectedLecturerId(e.target.value)}
                disabled={busy || !activeModuleId || availableLecturers.length === 0}
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
                onClick={() => void onAddLecturer()}
                disabled={busy || !activeModuleId || !selectedLecturerId}
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
                      onClick={() => void onRemoveLecturer(lecturer.id)}
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
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">Assigned learners</div>
              <div className="rounded-full border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
                {moduleStudents.length} linked
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <select
                id={`${idPrefix}-enrolled-student`}
                title="Select learner to add to module"
                aria-label="Select learner to add to module"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                disabled={busy || !activeModuleId || availableStudents.length === 0}
                className="select-glass"
              >
                {availableStudents.length === 0 ? (
                  <option value="">No additional learners available</option>
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
                onClick={() => void onAddStudent()}
                disabled={busy || !activeModuleId || !selectedStudentId}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
              >
                Add learner
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search learners by name, number, or email"
                className="input-glass"
                aria-label="Search learners in selected module"
                title="Search learners in selected module"
              />

              {moduleStudents.length === 0 ? (
                <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.52)] p-3 text-sm text-white/75">
                  No learners linked to this module yet.
                </div>
              ) : visibleModuleStudents.length === 0 ? (
                <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.52)] p-3 text-sm text-white/75">
                  No learners matched your search.
                </div>
              ) : (
                visibleModuleStudents.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.52)] p-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-white">
                        {studentDisplayName(student)}
                      </div>
                      <div className="text-xs text-white/60">{studentMeta(student)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onRemoveStudent(student.id)}
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
