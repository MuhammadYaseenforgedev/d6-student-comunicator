import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import CourseAssessmentsPanel from "../components/CourseAssessmentsPanel";
import CourseMarksheetPanel from "../components/CourseMarksheetPanel";
import CourseModulesManager from "../components/CourseModulesManager";
import PageHeader from "../components/PageHeader";
import StudentProfileDetailPanel from "../components/StudentProfileDetailPanel";
import { getUser } from "../lib/auth";
import { isAcademicOrSuperAdmin, isFinanceAdmin } from "../lib/adminAccess";
import {
  assignModuleToCourse,
  createCourse,
  deleteCourse,
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
import {
  getStudentProfileDetail,
  listStudentProfiles,
  type StudentProfileDetail,
  type StudentProfileListItem,
} from "../lib/studentProfileApi";

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

function getStatusTone(status: string | null | undefined): string {
  const normalized = status?.trim().toUpperCase();

  if (normalized === "ACTIVE") {
    return "border-[rgba(140,235,255,0.32)] bg-[rgba(8,18,48,0.82)] text-[#8CEBFF] shadow-[0_0_14px_rgba(140,235,255,0.34)]";
  }

  if (normalized === "INACTIVE" || normalized === "ARCHIVED") {
    return "border-[rgba(255,94,130,0.30)] bg-[rgba(74,10,31,0.62)] text-[#ff8ea8] shadow-[0_0_14px_rgba(255,94,130,0.28)]";
  }

  return "border-[rgba(255,255,255,0.24)] bg-[rgba(255,255,255,0.06)] text-white shadow-[0_0_10px_rgba(255,255,255,0.14)]";
}

function StatusBadge({
  status,
  fallback = "NONE",
}: {
  status?: string | null;
  fallback?: string;
}) {
  const label = status?.trim() ? status.trim().toUpperCase() : fallback;

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] transition",
        getStatusTone(label),
      ].join(" ")}
    >
      {label}
    </span>
  );
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
      <div className="text-xs uppercase tracking-[0.16em] text-white/60">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <div className="text-lg font-semibold text-white">{title}</div>
      {subtitle ? <div className="mt-1 text-sm text-white/70">{subtitle}</div> : null}
    </div>
  );
}

function PremiumCourseCard({
  course,
  selected,
  onClick,
}: {
  course: CourseRecord;
  selected?: boolean;
  onClick?: () => void;
}) {
  const statusLabel = course.isActive ? "ACTIVE" : "INACTIVE";

  const content = (
    <>
      <div className="pointer-events-none absolute inset-0 opacity-100">
        <div className="absolute -left-10 -top-10 h-28 w-28 rounded-full bg-[#8CEBFF]/10 blur-3xl" />
        <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-[#8C5BFF]/10 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8CEBFF]/35 to-transparent" />
      </div>

      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-white">{course.name}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-white/55">
              {course.code}
            </div>
          </div>
          <StatusBadge status={statusLabel} />
        </div>

        <div className="mt-4 text-sm leading-6 text-white/72">
          {course.description?.trim() || "No course description has been added yet."}
        </div>

        <div className="mt-4 rounded-2xl border border-[rgba(140,235,255,0.12)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-xs text-white/70">
          Modules: {summarizeModules(course.modules, 3)}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.52)] px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/55">Modules</div>
            <div className="mt-1 text-base font-semibold text-white">
              {course.summary.moduleCount}
            </div>
          </div>
          <div className="rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.52)] px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/55">Students</div>
            <div className="mt-1 text-base font-semibold text-white">
              {course.summary.studentCount}
            </div>
          </div>
          <div className="rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.52)] px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/55">Lecturers</div>
            <div className="mt-1 text-base font-semibold text-white">
              {course.summary.lecturerCount}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={[
          "relative overflow-hidden rounded-3xl border p-5 text-left transition-all duration-200",
          selected
            ? "border-[rgba(140,235,255,0.34)] bg-[rgba(15,37,88,0.82)] shadow-[0_0_0_1px_rgba(140,235,255,0.18)_inset,0_0_22px_rgba(140,235,255,0.14)]"
            : "border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] hover:border-[rgba(140,235,255,0.28)] hover:shadow-[0_0_18px_rgba(140,235,255,0.12)]",
        ].join(" ")}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-5 shadow-[0_0_18px_rgba(140,235,255,0.10)]">
      {content}
    </div>
  );
}

const adminCourseWorkspaceTabs = [
  { id: "overview", label: "Overview" },
  { id: "modules", label: "Modules" },
  { id: "marksheet", label: "Marksheet" },
  { id: "assessments", label: "Assessments" },
] as const;

type AdminCourseWorkspaceTab = (typeof adminCourseWorkspaceTabs)[number]["id"];

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
        <div className="teal-glow-card p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-white/60">Status</div>
          <div className="mt-3">
            <StatusBadge status={courses.length > 0 ? "ACTIVE" : "NONE"} />
          </div>
        </div>
      </div>

      {loading ? (
        <EmptyState title="Loading courses" message="Fetching your course and module summary." />
      ) : courses.length === 0 ? (
        <EmptyState
          title="No course assigned"
          message="Your student account is not enrolled in a course yet. Ask an academic admin to enroll you before modules can appear here."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {courses.map((course, index) => {
              const modules = course.modules.filter((module) => module.isStudentLinked);
              const lecturers = uniqueLecturerEmails(modules);

              return (
                <div
                  key={course.id}
                  className="relative overflow-hidden rounded-3xl border border-[rgba(140,235,255,0.20)] bg-[rgba(8,18,48,0.66)] p-5 shadow-[0_0_20px_rgba(140,235,255,0.10)]"
                >
                  <div className="pointer-events-none absolute inset-0 opacity-100">
                    <div className="absolute -left-10 -top-10 h-28 w-28 rounded-full bg-[#8CEBFF]/10 blur-3xl" />
                    <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-[#8C5BFF]/10 blur-3xl" />
                  </div>

                  <div className="relative flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{course.name}</div>
                      <div className="mt-1 text-sm text-white/65">
                        {course.code}
                        {index === 0 ? " | Primary course in your dashboard" : ""}
                      </div>
                    </div>
                    <StatusBadge status={course.enrollmentStatus ?? "ACTIVE"} />
                  </div>

                  <div className="relative mt-3 text-sm text-white/72">
                    {course.description?.trim() || "No course description has been added yet."}
                  </div>

                  <div className="relative mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <SummaryCard label="Modules" value={modules.length} />
                    <SummaryCard label="Lecturers" value={lecturers.length} />
                    <div className="teal-glow-card p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-white/60">Status</div>
                      <div className="mt-3">
                        <StatusBadge status={course.enrollmentStatus ?? "ACTIVE"} />
                      </div>
                    </div>
                  </div>

                  <div className="relative mt-3 text-xs text-white/60">
                    Enrolled: {formatDate(course.enrolledAt)}
                  </div>

                  <div className="relative mt-5">
                    <SectionTitle title="Linked modules" />
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

          <CourseAssessmentsPanel
            modules={linkedModules}
            canManage={false}
            title="Assessments"
            subtitle="Download lecturer-uploaded assessments for the modules linked to your student account."
          />
        </div>
      )}
    </div>
  );
}

function LecturerCoursesView() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentRows, setStudentRows] = useState<StudentProfileListItem[]>([]);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedStudentProfile, setSelectedStudentProfile] =
    useState<StudentProfileDetail | null>(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  );

  async function loadCoursesData() {
    const rows = await listCourses();
    setCourses(rows);
    setSelectedCourseId((current) =>
      rows.some((course) => course.id === current) ? current : (rows[0]?.id ?? "")
    );
  }

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadCoursesData();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load lecturer courses");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedCourseId) {
      setStudentRows([]);
      setSelectedStudentId("");
      setSelectedStudentProfile(null);
      setStudentError(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setStudentLoading(true);
        setStudentError(null);
        const rows = await listStudentProfiles({
          courseId: selectedCourseId,
          q: studentSearch || undefined,
          limit: 100,
        });
        if (cancelled) return;
        setStudentRows(rows);
        setSelectedStudentId((current) =>
          rows.some((row) => row.userId === current) ? current : (rows[0]?.userId ?? "")
        );
      } catch (e) {
        if (!cancelled) {
          setStudentRows([]);
          setSelectedStudentId("");
          setSelectedStudentProfile(null);
          setStudentError(
            e instanceof Error ? e.message : "Failed to load student profiles"
          );
        }
      } finally {
        if (!cancelled) {
          setStudentLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCourseId, studentSearch]);

  useEffect(() => {
    if (!selectedStudentId) {
      setSelectedStudentProfile(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setStudentDetailLoading(true);
        setStudentError(null);
        const profile = await getStudentProfileDetail(selectedStudentId);
        if (!cancelled) {
          setSelectedStudentProfile(profile);
        }
      } catch (e) {
        if (!cancelled) {
          setSelectedStudentProfile(null);
          setStudentError(
            e instanceof Error ? e.message : "Failed to load student profile"
          );
        }
      } finally {
        if (!cancelled) {
          setStudentDetailLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedStudentId]);

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
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {courses.map((course) => (
              <PremiumCourseCard
                key={course.id}
                course={course}
                selected={course.id === selectedCourseId}
                onClick={() => setSelectedCourseId(course.id)}
              />
            ))}
          </div>

          {selectedCourse ? (
            <>
              <div className="teal-glow-card p-5">
                <SectionTitle
                  title="Selected Course"
                  subtitle="Review modules already linked to this course, then manage module setup and membership below."
                />
                <div className="mt-4 rounded-2xl border border-[rgba(140,235,255,0.12)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-white/72">
                  {selectedCourse.code} - {selectedCourse.name}
                </div>
                <div className="mt-4 space-y-3">
                  {selectedCourse.modules.length === 0 ? (
                    <EmptyState
                      title="No modules in course"
                      message="Create the first module for this course below."
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
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="teal-glow-card p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <SectionTitle
                    title="Student Profiles"
                    subtitle="Search learners in your allowed course and inspect their personal, academic, and payment capture details."
                  />

                  <div className="rounded-2xl border border-[rgba(140,235,255,0.16)] bg-[rgba(8,18,48,0.56)] px-3 py-2 text-xs text-white/70">
                    {studentRows.length} learner{studentRows.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="divider-soft my-5" />

                <form
                  className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setStudentSearch(studentSearchInput.trim());
                  }}
                >
                  <input
                    value={studentSearchInput}
                    onChange={(e) => setStudentSearchInput(e.target.value)}
                    className="input-glass"
                    placeholder="Search by email or ID number"
                    title="Search student profiles"
                    aria-label="Search student profiles"
                  />
                  <button type="submit" className="btn-primary min-w-[110px]">
                    Search
                  </button>
                </form>

                {studentError && <div className="error-banner mt-4">{studentError}</div>}

                <div className="mt-5 grid grid-cols-1 gap-6 xl:h-[min(42rem,calc(100vh-16rem))] xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="workspace-scroll-panel">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <SectionTitle
                        title="Learner Directory"
                        subtitle="Choose a learner from this course to inspect their profile."
                      />
                      <div className="workspace-meta-pill">
                        {studentRows.length} learner{studentRows.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div className="divider-soft my-5" />

                    <div className="app-page-scroll space-y-3 max-h-none overflow-visible pr-0 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-2">
                      {studentLoading ? (
                        <div className="info-banner">Loading student profiles...</div>
                      ) : studentRows.length === 0 ? (
                        <EmptyState
                          title="No learners matched"
                          message="Try another email or ID number, or pick a different course."
                        />
                      ) : (
                        studentRows.map((student) => (
                          <button
                            key={student.userId}
                            type="button"
                            onClick={() => setSelectedStudentId(student.userId)}
                            className={[
                              "w-full rounded-3xl border p-4 text-left transition-all duration-200",
                              student.userId === selectedStudentId
                                ? "border-[rgba(140,235,255,0.30)] bg-[rgba(14,42,99,0.28)] shadow-[0_0_0_1px_rgba(140,235,255,0.05),0_0_18px_rgba(140,235,255,0.08)]"
                                : "border-[rgba(140,235,255,0.14)] bg-[rgba(8,18,48,0.50)] hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.24)] hover:bg-[rgba(8,18,48,0.66)]",
                            ].join(" ")}
                          >
                            <div className="text-sm font-semibold text-white">
                              {`${student.fullName} ${student.surname}`.trim() || student.email}
                            </div>
                            <div className="mt-1 text-xs text-white/60">{student.email}</div>
                            <div className="mt-2 text-xs text-white/72">
                              {student.idNumber || "No ID number"} |{" "}
                              {student.studentNumber || "No student number"}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-full border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] px-2.5 py-1 text-[11px] text-white/70">
                                {student.courseCode?.trim() || student.courseName?.trim() || "Course not assigned"}
                              </span>
                              <span className="rounded-full border border-[rgba(255,196,87,0.24)] bg-[rgba(97,59,9,0.45)] px-2.5 py-1 text-[11px] text-[#ffe8b0]">
                                {student.feeStatus || "No fee status"}
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="workspace-scroll-panel">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <SectionTitle
                        title="Profile Detail"
                        subtitle="View the selected learner's personal, academic, and payment capture details."
                      />
                      <div className="workspace-meta-pill">
                        {selectedStudentProfile?.email || "No learner selected"}
                      </div>
                    </div>

                    <div className="divider-soft my-5" />

                    <div className="app-page-scroll max-h-none overflow-visible pr-0 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-2">
                      {!selectedStudentId ? (
                        <div className="info-banner">
                          Select a learner to view their profile.
                        </div>
                      ) : studentDetailLoading ? (
                        <div className="info-banner">Loading selected learner...</div>
                      ) : selectedStudentProfile ? (
                        <StudentProfileDetailPanel profile={selectedStudentProfile} />
                      ) : (
                        <div className="info-banner">
                          Student profile detail is unavailable for the selected learner.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <CourseModulesManager
                courses={courses}
                selectedCourseId={selectedCourseId}
                idPrefix="courses-lecturer-modules"
                title="Modules"
                subtitle="Manage module setup and module membership from inside Courses."
                onSelectedModuleIdChange={setSelectedModuleId}
                onChanged={loadCoursesData}
              />

              <CourseMarksheetPanel
                modules={selectedCourse.modules}
                selectedModuleId={selectedModuleId}
                onSelectedModuleIdChange={setSelectedModuleId}
              />

              <CourseAssessmentsPanel
                modules={selectedCourse.modules}
                selectedModuleId={selectedModuleId}
                onSelectedModuleIdChange={setSelectedModuleId}
                canManage
                title="Assessments"
                subtitle="Upload and manage assessment files for the selected course modules."
              />
            </>
          ) : null}
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
  const [selectedCourseModuleId, setSelectedCourseModuleId] = useState("");
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
  const [workspaceTab, setWorkspaceTab] =
    useState<AdminCourseWorkspaceTab>("overview");

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

  async function onDeleteCourse() {
    if (!selectedCourse) return;

    const confirmationMessage =
      selectedCourse.summary.studentCount > 0
        ? `Delete "${selectedCourse.code} - ${selectedCourse.name}"? This will remove ${selectedCourse.summary.studentCount} student course enrollment(s) and any course calendar entries. Linked modules must already be removed first.`
        : `Delete "${selectedCourse.code} - ${selectedCourse.name}"? Linked modules must already be removed first.`;

    if (!window.confirm(confirmationMessage)) return;

    try {
      setBusy(true);
      setError(null);
      setInfo(null);
      const deleted = await deleteCourse(selectedCourse.id);
      await loadAll();
      setSelectedCourseModuleId("");
      setSelectedModuleId("");
      setSelectedStudentId("");
      setInfo(`Course ${deleted.code} deleted.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete course");
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
        <div className="space-y-6 lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto lg:pr-2">
          <div className="teal-glow-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle
                title="Course Catalog"
                subtitle="Review each course and the modules currently linked to it before making changes."
              />
              <div className="rounded-full border border-[rgba(140,235,255,0.22)] bg-[rgba(8,18,48,0.66)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
                {courses.length} course{courses.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {courses.length === 0 ? (
                <EmptyState
                  title="No courses yet"
                  message="Create the first course before assigning modules or students."
                />
              ) : (
                courses.map((course) => (
                  <PremiumCourseCard
                    key={course.id}
                    course={course}
                    selected={course.id === selectedCourseId}
                    onClick={() => setSelectedCourseId(course.id)}
                  />
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_1fr]">
            <div className="teal-glow-card space-y-4 p-5">
              <SectionTitle
                title="Create Course"
                subtitle="Add a new course to the catalog before linking modules or students."
              />
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
                className="btn-primary w-full px-4 py-2 text-sm disabled:opacity-60 sm:w-auto"
              >
                {busy ? "Saving..." : "Create course"}
              </button>
            </div>

            <div className="teal-glow-card space-y-4 p-5">
              <SectionTitle
                title="Manage Course"
                subtitle="Update details, linked modules, and the current course state."
              />
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
                    aria-label="Select course to manage"
                    title="Select course to manage"
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

                  <div className="rounded-2xl border border-[rgba(255,196,87,0.20)] bg-[rgba(78,54,12,0.22)] p-3 text-sm text-[#ffe7b0]">
                    Deleting a course removes student course enrollments and course calendar entries.
                    Remove linked modules first before deleting the selected course.
                  </div>

                  <select
                    value={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.value)}
                    className="select-glass"
                    aria-label="Set course status"
                    title="Set course status"
                  >
                    <option value="true">Active</option>
                    <option value="false">Archived</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => void onSaveCourse()}
                    disabled={busy || !selectedCourse}
                    className="btn-primary w-full px-4 py-2 text-sm disabled:opacity-60 sm:w-auto"
                  >
                    {busy ? "Saving..." : "Save course"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void onDeleteCourse()}
                    disabled={busy || !selectedCourse || selectedCourse.modules.length > 0}
                    className="btn-danger px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {busy ? "Working..." : "Delete course"}
                  </button>
                </>
              )}
            </div>
          </div>

          {selectedCourse ? (
            <div className="teal-glow-card overflow-hidden p-5">
              <div className="relative overflow-hidden rounded-[1.75rem] border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] p-5">
                <div className="pointer-events-none absolute inset-0 opacity-100">
                  <div className="absolute -left-10 top-0 h-28 w-28 rounded-full bg-[#8CEBFF]/10 blur-3xl" />
                  <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-[#8C5BFF]/10 blur-3xl" />
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8CEBFF]/35 to-transparent" />
                </div>

                <div className="relative flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8CEBFF]/72">
                      Selected Course Workspace
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {selectedCourse.code} - {selectedCourse.name}
                    </div>
                    <div className="mt-2 max-w-3xl text-sm leading-6 text-white/72">
                      {selectedCourse.description?.trim() ||
                        "No course description has been added yet."}
                    </div>
                  </div>

                  <StatusBadge status={selectedCourse.isActive ? "ACTIVE" : "INACTIVE"} />
                </div>

                <div className="relative mt-4 rounded-2xl border border-[rgba(140,235,255,0.14)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-white/72">
                  Modules linked: {summarizeModules(selectedCourse.modules, 4)}
                </div>

                <div className="relative mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <SummaryCard label="Modules" value={selectedCourse.summary.moduleCount} />
                  <SummaryCard label="Students" value={selectedCourse.summary.studentCount} />
                  <SummaryCard label="Lecturers" value={selectedCourse.summary.lecturerCount} />
                  <div className="teal-glow-card p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-white/60">
                      Status
                    </div>
                    <div className="mt-3">
                      <StatusBadge status={selectedCourse.isActive ? "ACTIVE" : "INACTIVE"} />
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="mobile-chip-row mt-5 sm:flex sm:flex-wrap sm:gap-2"
                role="tablist"
                aria-label="Selected course workspace sections"
              >
                {adminCourseWorkspaceTabs.map((tab) => {
                  const active = workspaceTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setWorkspaceTab(tab.id)}
                      className={[
                        "tab-pill",
                        active ? "tab-pill-active" : "tab-pill-idle",
                      ].join(" ")}
                      aria-pressed={active}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="divider-soft mt-5" />

              <div className="mt-5 space-y-6">
                <div
                  className={workspaceTab === "overview" ? "space-y-6" : "hidden"}
                  aria-hidden={workspaceTab !== "overview"}
                >
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <div className="teal-glow-card space-y-4 p-5">
                      <SectionTitle
                        title="Assign Module"
                        subtitle="Link an existing module to the selected course."
                      />
                      <select
                        value={selectedModuleId}
                        onChange={(e) => setSelectedModuleId(e.target.value)}
                        disabled={availableModules.length === 0}
                        className="select-glass"
                        aria-label="Select module to link to course"
                        title="Select module to link to course"
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
                        className="btn-primary w-full px-4 py-2 text-sm disabled:opacity-60 sm:w-auto"
                      >
                        Link module
                      </button>
                    </div>

                    <div className="teal-glow-card space-y-4 p-5">
                      <SectionTitle
                        title="Enroll Student"
                        subtitle="Add a student to the selected course before linking them to its modules."
                      />
                      <select
                        value={selectedStudentId}
                        onChange={(e) => setSelectedStudentId(e.target.value)}
                        disabled={availableStudents.length === 0}
                        className="select-glass"
                        aria-label="Select student to enroll in course"
                        title="Select student to enroll in course"
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
                        className="btn-primary w-full px-4 py-2 text-sm disabled:opacity-60 sm:w-auto"
                      >
                        Enroll student
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <div className="teal-glow-card p-5">
                      <SectionTitle
                        title="Module Coverage"
                        subtitle="Review all modules linked to this course and their lecturer coverage."
                      />
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
                                  ? module.lecturers
                                      .map((lecturer) => lecturer.email)
                                      .join(", ")
                                  : "Not assigned yet"}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="teal-glow-card p-5">
                      <SectionTitle
                        title="Enrolled Students"
                        subtitle="Students in this course will receive linked module access."
                      />
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
                                  {student.studentNumber?.trim() || "No student number"} |
                                  {" "}Enrolled {formatDate(student.enrolledAt)}
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
                </div>

                <div
                  className={workspaceTab === "modules" ? "space-y-6" : "hidden"}
                  aria-hidden={workspaceTab !== "modules"}
                >
                  <CourseModulesManager
                    courses={courses}
                    selectedCourseId={selectedCourseId}
                    eligibleStudentIds={selectedCourse.students.map((student) => student.id)}
                    idPrefix="courses-admin-modules"
                    title="Modules"
                    subtitle="Create modules for the selected course and manage lecturer plus learner membership here."
                    canRemoveModules
                    onSelectedModuleIdChange={setSelectedCourseModuleId}
                    onChanged={loadAll}
                  />
                </div>

                <div
                  className={workspaceTab === "marksheet" ? "space-y-6" : "hidden"}
                  aria-hidden={workspaceTab !== "marksheet"}
                >
                  <CourseMarksheetPanel
                    modules={selectedCourse.modules}
                    selectedModuleId={selectedCourseModuleId}
                    onSelectedModuleIdChange={setSelectedCourseModuleId}
                  />
                </div>

                <div
                  className={workspaceTab === "assessments" ? "space-y-6" : "hidden"}
                  aria-hidden={workspaceTab !== "assessments"}
                >
                  <CourseAssessmentsPanel
                    modules={selectedCourse.modules}
                    selectedModuleId={selectedCourseModuleId}
                    onSelectedModuleIdChange={setSelectedCourseModuleId}
                    canManage
                    title="Assessments"
                    subtitle="Upload and manage assessment files for the selected course modules."
                  />
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No course selected"
              message="Create a course or pick an existing one to manage modules and enrollments."
            />
          )}
        </div>
      )}
    </div>
  );
}
