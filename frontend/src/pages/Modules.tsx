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
  courseLabel: string;
  lecturers: string[];
};

function buildModuleOptions(courses: CourseRecord[], role: string): ModuleOption[] {
  return courses.flatMap((course) =>
    course.modules
      .filter((module) => role !== "STUDENT" || module.isStudentLinked)
      .map((module) => ({
        id: module.id,
        label: `${module.code} - ${module.name}`,
        courseLabel: `${course.code} - ${course.name}`,
        lecturers: module.lecturers.map((lecturer) => lecturer.email),
      }))
  );
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

  const requestedModuleId = String(searchParams.get("moduleId") ?? "").trim();
  const selectedModuleId =
    moduleOptions.find((option) => option.id === requestedModuleId)?.id ??
    moduleOptions[0]?.id ??
    "";

  useEffect(() => {
    if (moduleOptions.length === 0) {
      if (requestedModuleId) {
        const next = new URLSearchParams(searchParams);
        next.delete("moduleId");
        setSearchParams(next, { replace: true });
      }
      return;
    }

    if (selectedModuleId !== requestedModuleId) {
      const next = new URLSearchParams(searchParams);
      next.set("moduleId", selectedModuleId);
      setSearchParams(next, { replace: true });
    }
  }, [moduleOptions, requestedModuleId, searchParams, selectedModuleId, setSearchParams]);

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
    ? "Choose one of your linked modules to keep announcements focused."
    : isLecturer
      ? "Choose a module you teach to review or post targeted module announcements."
      : "Choose a course module to review or post targeted module announcements.";

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
        ) : moduleOptions.length === 0 ? (
          <EmptyState
            title="No modules available"
            subtitle={
              isStudent
                ? "You are not linked to any course modules yet."
                : isLecturer
                  ? "No modules are assigned to your lecturer account yet."
                  : "No modules are linked to courses yet."
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
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
                  next.set("moduleId", e.target.value);
                  setSearchParams(next, { replace: true });
                }}
                className="select-glass mt-1"
              >
                {moduleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {selectedModule && (
              <div className="rounded-2xl border border-[#38D5FF]/22 bg-[rgba(8,18,48,0.56)] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[#8CEBFF]">
                  Selected module
                </div>
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
              </div>
            )}
          </div>
        )}
      </div>

      {moduleOptions.length > 0 && (
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
        moduleOptions={moduleOptions.map((option) => ({
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
