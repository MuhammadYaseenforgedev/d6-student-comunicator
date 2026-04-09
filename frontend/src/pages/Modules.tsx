import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AnnouncementCard from "../components/AnnouncementCard";
import AnnouncementSkeleton from "../components/AnnouncementSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorBanner from "../components/ErrorBanner";
import NewAnnouncementModal from "../components/NewAnnouncementModal";
import PageHeader from "../components/PageHeader";
import { useAnnouncements } from "../hooks/useAnnouncements";
import { getUser } from "../lib/auth";
import { listCourses, type CourseRecord } from "../lib/courseApi";

type ModuleOption = {
  id: string;
  label: string;
  courseId: string;
  courseLabel: string;
  lecturers: string[];
};

type CourseOption = {
  id: string;
  label: string;
  moduleCount: number;
};

function buildModuleOptions(courses: CourseRecord[], role: string): ModuleOption[] {
  return courses.flatMap((course) =>
    course.modules
      .filter((module) => role !== "STUDENT" || module.isStudentLinked)
      .map((module) => ({
        id: module.id,
        label: `${module.code} - ${module.name}`,
        courseId: course.id,
        courseLabel: `${course.code} - ${course.name}`,
        lecturers: module.lecturers.map((lecturer) => lecturer.email),
      }))
  );
}

function buildCourseOptions(courses: CourseRecord[], moduleOptions: ModuleOption[]): CourseOption[] {
  const counts = new Map<string, number>();

  for (const module of moduleOptions) {
    counts.set(module.courseId, (counts.get(module.courseId) ?? 0) + 1);
  }

  return courses.map((course) => ({
    id: course.id,
    label: `${course.code} - ${course.name}`,
    moduleCount: counts.get(course.id) ?? 0,
  }));
}

export default function Modules() {
  const user = getUser();
  const role = String(user?.role ?? "").toUpperCase();
  const isStudent = role === "STUDENT";
  const isLecturer = role === "LECTURER";

  const [searchParams, setSearchParams] = useSearchParams();
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [moduleLoading, setModuleLoading] = useState(true);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCourses() {
      setModuleLoading(true);
      setModuleError(null);
      try {
        const rows = await listCourses();
        if (!cancelled) setCourses(rows);
      } catch (e: unknown) {
        if (!cancelled) {
          setModuleError(
            e instanceof Error ? e.message : "Failed to load course modules"
          );
        }
      } finally {
        if (!cancelled) setModuleLoading(false);
      }
    }

    void loadCourses();
    return () => {
      cancelled = true;
    };
  }, []);

  const moduleOptions = useMemo(
    () => buildModuleOptions(courses, role),
    [courses, role]
  );
  const courseOptions = useMemo(
    () => buildCourseOptions(courses, moduleOptions),
    [courses, moduleOptions]
  );

  const requestedCourseId = String(searchParams.get("courseId") ?? "").trim();
  const requestedModuleId = String(searchParams.get("moduleId") ?? "").trim();
  const selectedCourseId = useMemo(() => {
    const requestedModuleCourseId =
      moduleOptions.find((option) => option.id === requestedModuleId)?.courseId ?? "";

    if (courseOptions.some((course) => course.id === requestedCourseId)) {
      return requestedCourseId;
    }

    if (requestedModuleCourseId && courseOptions.some((course) => course.id === requestedModuleCourseId)) {
      return requestedModuleCourseId;
    }

    return courseOptions.find((course) => course.moduleCount > 0)?.id ?? courseOptions[0]?.id ?? "";
  }, [courseOptions, moduleOptions, requestedCourseId, requestedModuleId]);

  const filteredModuleOptions = useMemo(
    () => moduleOptions.filter((option) => option.courseId === selectedCourseId),
    [moduleOptions, selectedCourseId]
  );

  const selectedModuleId =
    filteredModuleOptions.find((option) => option.id === requestedModuleId)?.id ??
    filteredModuleOptions[0]?.id ??
    "";

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;

    if (selectedCourseId) {
      if (requestedCourseId !== selectedCourseId) {
        next.set("courseId", selectedCourseId);
        changed = true;
      }
    } else if (requestedCourseId) {
      next.delete("courseId");
      changed = true;
    }

    if (selectedModuleId) {
      if (requestedModuleId !== selectedModuleId) {
        next.set("moduleId", selectedModuleId);
        changed = true;
      }
    } else if (requestedModuleId) {
      next.delete("moduleId");
      changed = true;
    }

    if (changed) {
      setSearchParams(next, { replace: true });
    }
  }, [
    requestedCourseId,
    requestedModuleId,
    searchParams,
    selectedCourseId,
    selectedModuleId,
    setSearchParams,
  ]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;
  const selectedModule = moduleOptions.find((option) => option.id === selectedModuleId) ?? null;

  const {
    items,
    loading,
    error,
    clearError,
    create,
    update,
    remove,
    canManage,
  } = useAnnouncements("modules", {
    moduleId: selectedModuleId || undefined,
    enabled: Boolean(selectedModuleId),
  });

  const subtitle = isStudent
    ? "Pick a course first, then choose one of your linked modules to keep announcements focused."
    : isLecturer
      ? "Pick one of your teaching courses, then choose the module you want to review or post to."
      : "Choose a course first, then select the module you want to review or post to.";

  const actions =
    canManage && selectedModuleId ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary"
        title="Create a new module announcement"
        aria-label="Create a new module announcement"
      >
        New announcement
      </button>
    ) : null;

  return (
    <div>
      <PageHeader
        title="Modules"
        subtitle={subtitle}
        actions={actions}
        tone="modules"
      />

      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 w-28 rounded-full bg-[#38D5FF]" />
        <div className="text-xs font-medium uppercase tracking-[0.22em] text-[#8CEBFF]">
          modules
        </div>
      </div>

      {moduleError && <ErrorBanner message={moduleError} onDismiss={() => setModuleError(null)} />}
      {error && <ErrorBanner message={error} onDismiss={clearError} />}

      <div className="mt-6 rounded-3xl border border-[#38D5FF]/40 bg-[#081A44]/72 p-5 shadow-[0_0_0_1px_rgba(56,213,255,0.18),0_0_18px_rgba(56,213,255,0.18),0_12px_30px_rgba(2,12,42,0.55)]">
        {moduleLoading ? (
          <div className="text-sm text-white/75">Loading your course modules...</div>
        ) : courseOptions.length === 0 ? (
          <EmptyState
            title="No courses available"
            subtitle={
              isStudent
                ? "You are not linked to any courses yet."
                : isLecturer
                  ? "No courses are assigned to your lecturer account yet."
                  : "No courses are available yet."
            }
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_1fr]">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="module-course-selector"
                  className="text-sm text-white/78"
                >
                  Course
                </label>
                <select
                  id="module-course-selector"
                  value={selectedCourseId}
                  onChange={(e) => {
                    const nextCourseId = e.target.value;
                    const next = new URLSearchParams(searchParams);
                    const nextModuleId =
                      moduleOptions.find((option) => option.courseId === nextCourseId)?.id ?? "";

                    if (nextCourseId) {
                      next.set("courseId", nextCourseId);
                    } else {
                      next.delete("courseId");
                    }

                    if (nextModuleId) {
                      next.set("moduleId", nextModuleId);
                    } else {
                      next.delete("moduleId");
                    }

                    setSearchParams(next, { replace: true });
                  }}
                  className="select-glass mt-1"
                >
                  {courseOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="module-announcement-selector"
                  className="text-sm text-white/78"
                >
                  Module
                </label>
                <select
                  id="module-announcement-selector"
                  value={selectedModuleId}
                  onChange={(e) => {
                    const next = new URLSearchParams(searchParams);

                    if (selectedCourseId) {
                      next.set("courseId", selectedCourseId);
                    }
                    next.set("moduleId", e.target.value);
                    setSearchParams(next, { replace: true });
                  }}
                  disabled={filteredModuleOptions.length === 0}
                  className="select-glass mt-1"
                >
                  {filteredModuleOptions.length === 0 ? (
                    <option value="">No modules available for this course</option>
                  ) : (
                    filteredModuleOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="rounded-2xl border border-[#38D5FF]/22 bg-[rgba(8,18,48,0.56)] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[#8CEBFF]">
                  Selected course
                </div>
                <div className="mt-2 text-base font-semibold text-white">
                  {selectedCourse ? `${selectedCourse.code} - ${selectedCourse.name}` : "No course selected"}
                </div>
                <div className="mt-2 text-sm text-white/72">
                  {filteredModuleOptions.length} module{filteredModuleOptions.length === 1 ? "" : "s"} available in this course.
                </div>
                <div className="mt-2 text-sm text-white/72">
                  Switch courses here, then pick the exact module you want below it.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#38D5FF]/22 bg-[rgba(8,18,48,0.56)] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[#8CEBFF]">
                Module overview
              </div>
              {selectedModule ? (
                <>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {selectedModule.label}
                  </div>
                  <div className="mt-1 text-sm text-white/78">
                    Course: {selectedModule.courseLabel}
                  </div>
                  <div className="mt-2 text-sm text-white/72">
                    Lecturers:{" "}
                    {selectedModule.lecturers.length > 0
                      ? selectedModule.lecturers.join(", ")
                      : "Not assigned yet"}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm leading-6 text-white/72">
                  {selectedCourse
                    ? "This course does not have any visible modules yet. Pick a different course or add modules first."
                    : "Choose a course to see its modules here."}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedModuleId && (
        <div className="mt-6 space-y-4">
          {loading ? (
            <>
              <AnnouncementSkeleton />
              <AnnouncementSkeleton />
              <AnnouncementSkeleton />
            </>
          ) : items.length === 0 ? (
            <EmptyState
              title="No announcements for this module yet"
              subtitle={
                canManage
                  ? "Create the first announcement for the selected module."
                  : "No announcements are available for the selected module right now."
              }
              action={
                canManage && selectedModuleId ? (
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="btn-secondary"
                  >
                    Create announcement
                  </button>
                ) : undefined
              }
            />
          ) : (
            items.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                a={announcement}
                canManage={canManage}
                onUpdate={(id, patch) => update({ id, ...patch })}
                onDelete={remove}
              />
            ))
          )}
        </div>
      )}

      <NewAnnouncementModal
        key={`modules-${selectedModuleId}-${open ? "open" : "closed"}`}
        open={open}
        onClose={() => setOpen(false)}
        defaultChannel="modules"
        channelOptions={["modules"]}
        lockChannel
        moduleOptions={filteredModuleOptions.map((option) => ({
          id: option.id,
          label: `${option.courseLabel} | ${option.label}`,
        }))}
        defaultModuleId={selectedModuleId}
        requireModuleSelection
        onCreate={create}
      />
    </div>
  );
}
