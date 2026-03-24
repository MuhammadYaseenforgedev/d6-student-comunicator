import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { getUser } from "../lib/auth";
import { isAcademicOrSuperAdmin, isFinanceAdmin } from "../lib/adminAccess";
import {
  assignModuleToCourse,
  createCourse,
  enrollStudentInCourse,
  listCourses,
  removeStudentFromCourse,
  type CourseModule,
  type CourseRecord,
  updateCourse,
} from "../lib/courseApi";
import {
  listAttendanceDirectoryUsers,
  listAttendanceModules,
  type AttendanceDirectoryUser,
  type AttendanceModule,
} from "../lib/attendanceApi";

function formatDate(raw: string | null): string {
  if (!raw) return "Not recorded";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  return new Date(ms).toLocaleDateString();
}

function uniqueLecturerEmails(modules: CourseModule[]): string[] {
  return Array.from(
    new Set(modules.flatMap((module) => module.lecturers.map((lecturer) => lecturer.email)))
  ).sort((a, b) => a.localeCompare(b));
}

function summarizeModules(modules: CourseModule[], limit = 3): string {
  if (modules.length === 0) return "No modules linked yet.";

  const visible = modules
    .slice(0, limit)
    .map((module) => `${module.code} - ${module.name}`);

  if (modules.length <= limit) return visible.join(", ");
  return `${visible.join(", ")} +${modules.length - limit} more`;
}

function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-5">
      <div className="text-base font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm text-white/72">{message}</div>
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

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="teal-glow-card p-4">
      <div className="text-xs uppercase tracking-wide text-white/65">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

export default function CoursesPage() {
  const user = getUser();

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "STUDENT") return <StudentCoursesView />;
  if (user.role === "LECTURER") return <LecturerCoursesView />;
  if (user.role === "ADMIN" && isAcademicOrSuperAdmin(user)) {
    return <AdminCoursesView />;
  }

  return <Navigate to={isFinanceAdmin(user) ? "/app/admin/finance" : "/app"} replace />;
}

function StudentCoursesView() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        setCourses(await listCourses());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load courses");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const linkedModules = useMemo(
    () => courses.flatMap((course) => course.modules.filter((module) => module.isStudentLinked)),
    [courses]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses"
        subtitle="View your enrolled course, linked modules, and lecturer coverage."
      />

      {error && <Alert tone="error" message={error} />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Enrolled Courses" value={courses.length} />
        <SummaryCard label="Linked Modules" value={linkedModules.length} />
        <SummaryCard
          label="Assigned Lecturers"
          value={uniqueLecturerEmails(linkedModules).length}
        />
        <SummaryCard label="Status" value={courses.length > 0 ? "Active" : "None"} />
      </div>

      {loading ? (
        <EmptyState title="Loading courses" message="Fetching your course and module summary." />
      ) : courses.length === 0 ? (
        <EmptyState
          title="No course assigned"
          message="Your student account is not enrolled in a course yet. Ask an academic admin to enroll you before modules can appear here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {courses.map((course, index) => {
            const modules = course.modules.filter((module) => module.isStudentLinked);
            const lecturers = uniqueLecturerEmails(modules);

            return (
              <div key={course.id} className="teal-glow-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {course.name}
                    </div>
                    <div className="mt-1 text-sm text-white/65">
                      {course.code}
                      {index === 0 ? " | Primary course in your dashboard" : ""}
                    </div>
                  </div>
                  <div className="rounded-full border border-[rgba(140,235,255,0.22)] bg-[rgba(8,18,48,0.66)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                    {course.enrollmentStatus ?? "ACTIVE"}
                  </div>
                </div>

                <div className="mt-3 text-sm text-white/72">
                  {course.description?.trim() || "No course description has been added yet."}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <SummaryCard label="Modules" value={modules.length} />
                  <SummaryCard label="Lecturers" value={lecturers.length} />
                  <SummaryCard label="Status" value={course.enrollmentStatus ?? "ACTIVE"} />
                </div>

                <div className="mt-3 text-xs text-white/60">
                  Enrolled: {formatDate(course.enrolledAt)}
                </div>

                <div className="mt-5">
                  <div className="text-sm font-semibold text-white">Linked modules</div>
                  <div className="mt-3 space-y-3">
                    {modules.length === 0 ? (
                      <EmptyState
                        title="No modules in course"
                        message="Your course is active, but no modules are linked to your student account yet."
                      />
                    ) : (
                      modules.map((module) => (
                        <div
                          key={module.id}
                          className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4"
                        >
                          <div className="font-semibold text-white">
                            {module.code} - {module.name}
                          </div>
                          <div className="mt-1 text-xs text-white/60">{module.facultyName}</div>
                          <div className="mt-2 text-xs text-white/72">
                            Lecturers:{" "}
                            {module.lecturers.length > 0
                              ? module.lecturers.map((lecturer) => lecturer.email).join(", ")
                              : "Not assigned yet"}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LecturerCoursesView() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        setCourses(await listCourses());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load lecturer courses");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses"
        subtitle="Courses represented by the modules you currently teach."
      />

      {error && <Alert tone="error" message={error} />}

      {loading ? (
        <EmptyState title="Loading courses" message="Fetching your teaching coverage." />
      ) : courses.length === 0 ? (
        <EmptyState
          title="No teaching courses yet"
          message="You are not assigned to any course-linked modules yet."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {courses.map((course) => (
            <div key={course.id} className="teal-glow-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white">{course.name}</div>
                  <div className="mt-1 text-sm text-white/65">{course.code}</div>
                </div>
                <div className="rounded-full border border-[rgba(140,235,255,0.22)] bg-[rgba(8,18,48,0.66)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                  {course.isActive ? "Active" : "Archived"}
                </div>
              </div>

              <div className="mt-3 text-sm text-white/72">
                {course.description?.trim() || "No course description has been added yet."}
              </div>

              <div className="mt-3 text-xs text-white/65">
                Linked modules: {summarizeModules(course.modules, 4)}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <SummaryCard label="Modules" value={course.summary.moduleCount} />
                <SummaryCard label="Students" value={course.summary.studentCount} />
                <SummaryCard label="Lecturers" value={course.summary.lecturerCount} />
              </div>

              <div className="mt-5">
                <div className="text-sm font-semibold text-white">Modules in this course</div>
                <div className="mt-3 space-y-3">
                  {course.modules.length === 0 ? (
                    <EmptyState
                      title="No modules in course"
                      message="This course does not have any linked modules yet."
                    />
                  ) : (
                    course.modules.map((module) => (
                      <div
                        key={module.id}
                        className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4"
                      >
                        <div className="font-semibold text-white">
                          {module.code} - {module.name}
                        </div>
                        <div className="mt-1 text-xs text-white/60">
                          {module.facultyName} | {module.enrolledCount} linked students
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminCoursesView() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [modules, setModules] = useState<AttendanceModule[]>([]);
  const [students, setStudents] = useState<AttendanceDirectoryUser[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsActive, setEditIsActive] = useState("true");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  );

  const availableModules = useMemo(() => {
    return modules.filter((module) => module.courseId !== selectedCourseId);
  }, [modules, selectedCourseId]);

  const availableStudents = useMemo(() => {
    const enrolled = new Set((selectedCourse?.students ?? []).map((student) => student.id));
    return students.filter((student) => !enrolled.has(student.id));
  }, [selectedCourse, students]);

  async function loadAll() {
    const [courseRows, moduleRows, studentRows] = await Promise.all([
      listCourses(),
      listAttendanceModules(),
      listAttendanceDirectoryUsers({ roles: ["STUDENT"], limit: 500 }),
    ]);
    setCourses(courseRows);
    setModules(moduleRows);
    setStudents(studentRows);
    setSelectedCourseId((current) =>
      courseRows.some((course) => course.id === current) ? current : (courseRows[0]?.id ?? "")
    );
  }

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadAll();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load course management");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedCourse) {
      setEditCode("");
      setEditName("");
      setEditDescription("");
      setEditIsActive("true");
      return;
    }

    setEditCode(selectedCourse.code);
    setEditName(selectedCourse.name);
    setEditDescription(selectedCourse.description ?? "");
    setEditIsActive(selectedCourse.isActive ? "true" : "false");
  }, [selectedCourse]);

  useEffect(() => {
    setSelectedModuleId((current) =>
      availableModules.some((module) => module.id === current)
        ? current
        : (availableModules[0]?.id ?? "")
    );
  }, [availableModules]);

  useEffect(() => {
    setSelectedStudentId((current) =>
      availableStudents.some((student) => student.id === current)
        ? current
        : (availableStudents[0]?.id ?? "")
    );
  }, [availableStudents]);

  async function onCreateCourse() {
    if (!newCode.trim() || !newName.trim()) {
      setError("Course code and course name are required.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      const created = await createCourse({
        code: newCode.trim().toUpperCase(),
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      setNewCode("");
      setNewName("");
      setNewDescription("");
      await loadAll();
      setSelectedCourseId(created.id);
      setInfo(`Course ${created.code} created.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create course");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveCourse() {
    if (!selectedCourse) return;
    if (!editCode.trim() || !editName.trim()) {
      setError("Course code and name are required.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await updateCourse(selectedCourse.id, {
        code: editCode.trim().toUpperCase(),
        name: editName.trim(),
        description: editDescription.trim(),
        isActive: editIsActive === "true",
      });
      await loadAll();
      setInfo("Course updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update course");
    } finally {
      setBusy(false);
    }
  }

  async function onAssignModule() {
    if (!selectedCourseId || !selectedModuleId) {
      setError("Select a course and module first.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await assignModuleToCourse(selectedCourseId, selectedModuleId);
      await loadAll();
      setInfo("Module linked to course.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign module to course");
    } finally {
      setBusy(false);
    }
  }

  async function onEnrollStudent() {
    if (!selectedCourseId || !selectedStudentId) {
      setError("Select a course and student first.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await enrollStudentInCourse(selectedCourseId, selectedStudentId);
      await loadAll();
      setInfo("Student enrolled in course.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enroll student");
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveStudent(studentId: string) {
    if (!selectedCourseId) return;

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      await removeStudentFromCourse(selectedCourseId, studentId);
      await loadAll();
      setInfo("Student removed from course.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove student");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses"
        subtitle="Create, update, archive, and staff course coverage for students and modules."
      />

      {error && <Alert tone="error" message={error} />}
      {info && <Alert tone="info" message={info} />}

      {loading ? (
        <EmptyState title="Loading courses" message="Fetching course management data." />
      ) : (
        <>
          <div className="teal-glow-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">Course Catalog</div>
                <div className="mt-1 text-sm text-white/72">
                  Review each course and the modules currently linked to it before making changes.
                </div>
              </div>
              <div className="rounded-full border border-[rgba(140,235,255,0.22)] bg-[rgba(8,18,48,0.66)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                {courses.length} course{courses.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {courses.length === 0 ? (
                <EmptyState
                  title="No courses yet"
                  message="Create the first course before assigning modules or students."
                />
              ) : (
                courses.map((course) => {
                  const isSelected = course.id === selectedCourseId;
                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => setSelectedCourseId(course.id)}
                      className={[
                        "rounded-3xl border p-4 text-left transition",
                        isSelected
                          ? "border-[rgba(140,235,255,0.34)] bg-[rgba(15,37,88,0.82)] shadow-[0_0_0_1px_rgba(140,235,255,0.18)_inset]"
                          : "border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] hover:border-[rgba(140,235,255,0.28)]",
                      ].join(" ")}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-white">{course.name}</div>
                          <div className="mt-1 text-xs text-white/60">{course.code}</div>
                        </div>
                        <div className="rounded-full border border-[rgba(140,235,255,0.22)] bg-[rgba(8,18,48,0.66)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80">
                          {course.isActive ? "Active" : "Archived"}
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-white/72">
                        Modules: {summarizeModules(course.modules, 3)}
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-white/60">
                        <div>{course.summary.moduleCount} modules</div>
                        <div>{course.summary.studentCount} students</div>
                        <div>{course.summary.lecturerCount} lecturers</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_1fr]">
            <div className="teal-glow-card space-y-4 p-5">
              <div className="text-lg font-semibold text-white">Create Course</div>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="COURSE-CODE"
                className="input-glass"
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Course name"
                className="input-glass"
              />
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Course description"
                className="input-glass min-h-[120px]"
              />
              <button
                type="button"
                onClick={() => void onCreateCourse()}
                disabled={busy}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
              >
                {busy ? "Saving..." : "Create course"}
              </button>
            </div>

            <div className="teal-glow-card space-y-4 p-5">
              <div className="text-lg font-semibold text-white">Manage Course</div>
              {courses.length === 0 ? (
                <EmptyState
                  title="No courses yet"
                  message="Create the first course before assigning modules or students."
                />
              ) : (
                <>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="select-glass"
                  >
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.code} - {course.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                    placeholder="Course code"
                    className="input-glass"
                  />
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Course name"
                    className="input-glass"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Course description"
                    className="input-glass min-h-[120px]"
                  />
                  <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] p-3 text-sm text-white/72">
                    Linked modules: {summarizeModules(selectedCourse?.modules ?? [], 5)}
                  </div>
                  <select
                    value={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.value)}
                    className="select-glass"
                  >
                    <option value="true">Active</option>
                    <option value="false">Archived</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void onSaveCourse()}
                    disabled={busy || !selectedCourse}
                    className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {busy ? "Saving..." : "Save course"}
                  </button>
                </>
              )}
            </div>
          </div>

          {selectedCourse ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <SummaryCard label="Modules" value={selectedCourse.summary.moduleCount} />
                <SummaryCard label="Students" value={selectedCourse.summary.studentCount} />
                <SummaryCard label="Lecturers" value={selectedCourse.summary.lecturerCount} />
                <SummaryCard label="Status" value={selectedCourse.isActive ? "Active" : "Archived"} />
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="teal-glow-card space-y-4 p-5">
                  <div className="text-lg font-semibold text-white">Assign Module</div>
                  <div className="text-sm text-white/72">
                    Link an existing module to the selected course.
                  </div>
                  <select
                    value={selectedModuleId}
                    onChange={(e) => setSelectedModuleId(e.target.value)}
                    disabled={availableModules.length === 0}
                    className="select-glass"
                  >
                    {availableModules.length === 0 ? (
                      <option value="">All modules are already linked to this course</option>
                    ) : (
                      availableModules.map((module) => (
                        <option key={module.id} value={module.id}>
                          {module.code} - {module.name}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => void onAssignModule()}
                    disabled={busy || !selectedModuleId}
                    className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
                  >
                    Link module
                  </button>
                </div>

                <div className="teal-glow-card space-y-4 p-5">
                  <div className="text-lg font-semibold text-white">Enroll Student</div>
                  <div className="text-sm text-white/72">
                    Add a student to the selected course before linking them to its modules.
                  </div>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    disabled={availableStudents.length === 0}
                    className="select-glass"
                  >
                    {availableStudents.length === 0 ? (
                      <option value="">All available students are already enrolled</option>
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
                    onClick={() => void onEnrollStudent()}
                    disabled={busy || !selectedStudentId}
                    className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
                  >
                    Enroll student
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="teal-glow-card p-5">
                  <div className="text-lg font-semibold text-white">Module Coverage</div>
                  <div className="mt-3 space-y-3">
                    {selectedCourse.modules.length === 0 ? (
                      <EmptyState
                        title="No modules in course"
                        message="Assign at least one module to this course to expose lecturer coverage."
                      />
                    ) : (
                      selectedCourse.modules.map((module) => (
                        <div
                          key={module.id}
                          className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4"
                        >
                          <div className="font-semibold text-white">
                            {module.code} - {module.name}
                          </div>
                          <div className="mt-1 text-xs text-white/60">
                            {module.facultyName} | {module.enrolledCount} linked students
                          </div>
                          <div className="mt-2 text-xs text-white/72">
                            Lecturers:{" "}
                            {module.lecturers.length > 0
                              ? module.lecturers.map((lecturer) => lecturer.email).join(", ")
                              : "Not assigned yet"}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="teal-glow-card p-5">
                  <div className="text-lg font-semibold text-white">Enrolled Students</div>
                  <div className="mt-3 space-y-3">
                    {selectedCourse.students.length === 0 ? (
                      <EmptyState
                        title="No students enrolled"
                        message="Enroll a student in this course to unlock module access and dashboard course content."
                      />
                    ) : (
                      selectedCourse.students.map((student) => (
                        <div
                          key={student.id}
                          className="flex items-center justify-between gap-3 rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4"
                        >
                          <div>
                            <div className="font-semibold text-white">{student.email}</div>
                            <div className="mt-1 text-xs text-white/60">
                              {student.studentNumber?.trim() || "No student number"} | Enrolled{" "}
                              {formatDate(student.enrolledAt)}
                            </div>
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
            </>
          ) : (
            <EmptyState
              title="No course selected"
              message="Create a course or pick an existing one to manage modules and enrollments."
            />
          )}
        </>
      )}
    </div>
  );
}
