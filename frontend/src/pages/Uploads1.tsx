// src/pages/Uploads1.tsx
// Uploads page.
// Responsibilities:
// - Allow eligible users to upload files
// - List uploaded files the current user can access
// - Support download for visible files
// - Support delete for lecturer/admin roles
// - Keep styling aligned with the shared neon glass theme

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import {
  deleteUpload,
  downloadUpload,
  listUploads,
  uploadFile,
} from "../api/uploads";
import {
  listAttendanceModuleStudents,
  type AttendanceModuleStudent,
} from "../lib/attendanceApi";
import { getUser } from "../lib/auth";
import { listCourses, type CourseRecord } from "../lib/courseApi";
import type { UploadKind, UploadRecord, UserRole } from "../lib/types";

type UploadModuleOption = {
  id: string;
  label: string;
  courseId: string;
  courseLabel: string;
  lecturers: Array<{ id: string; email: string }>;
};

type UploadCourseOption = {
  id: string;
  label: string;
  moduleCount: number;
};

type UploadTargetOption = {
  id: string;
  email: string;
  role: UserRole;
  label: string;
};

function prettySize(bytes: number) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function kindLabel(kind: UploadKind): string {
  return kind === "STUDENT_SUBMISSION"
    ? "Student submission"
    : "Lecturer material";
}

function buildUploadModuleOptions(
  courses: CourseRecord[],
  role: UserRole
): UploadModuleOption[] {
  return courses.flatMap((course) =>
    course.modules
      .filter((module) => role !== "STUDENT" || module.isStudentLinked)
      .map((module) => ({
        id: module.id,
        label: `${module.code} - ${module.name}`,
        courseId: course.id,
        courseLabel: `${course.code} - ${course.name}`,
        lecturers: module.lecturers,
      }))
  );
}

function buildUploadCourseOptions(
  courses: CourseRecord[],
  moduleOptions: UploadModuleOption[]
): UploadCourseOption[] {
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

function studentTargetLabel(student: AttendanceModuleStudent): string {
  const name = `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim();
  const secondary = student.studentNumber?.trim() || student.email;
  return name ? `${name} | ${secondary}` : secondary;
}

function uploadContextLabel(upload: UploadRecord): string {
  const courseLabel =
    upload.courseCode || upload.courseName
      ? `${upload.courseCode ?? "Course"}${upload.courseName ? ` - ${upload.courseName}` : ""}`
      : "";
  const moduleLabel =
    upload.moduleCode || upload.moduleName
      ? `${upload.moduleCode ?? "Module"}${upload.moduleName ? ` - ${upload.moduleName}` : ""}`
      : "";

  if (courseLabel && moduleLabel) return `${courseLabel} | ${moduleLabel}`;
  if (moduleLabel) return moduleLabel;
  if (courseLabel) return courseLabel;
  return "Legacy upload without module context";
}

function noCourseMessage(role: UserRole): string {
  if (role === "STUDENT") return "You are not linked to any enrolled modules yet.";
  if (role === "LECTURER") return "No teaching modules are assigned to your lecturer account yet.";
  return "No courses are available for uploads yet.";
}

function noModuleMessage(role: UserRole): string {
  if (role === "STUDENT") return "No modules from this course are linked to your student account yet.";
  if (role === "LECTURER") return "No modules from this course are assigned to you yet.";
  return "No modules are linked to the selected course yet.";
}

export default function Uploads1() {
  const user = getUser();
  const role = (user?.role ?? "STUDENT") as UserRole;
  const email = (user?.email ?? "dev@local").trim().toLowerCase();
  const isAdmin = role === "ADMIN";
  const canUpload =
    role === "STUDENT" || role === "LECTURER" || role === "ADMIN";
  const canDelete = role === "LECTURER" || role === "ADMIN";
  const [uploadKind, setUploadKind] = useState<UploadKind>(
    role === "STUDENT" ? "STUDENT_SUBMISSION" : "LECTURER_MATERIAL"
  );

  const [items, setItems] = useState<UploadRecord[]>([]);
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [moduleStudentTargets, setModuleStudentTargets] = useState<
    UploadTargetOption[]
  >([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const rows = await listUploads();
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load uploads");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canUpload) return;

    let cancelled = false;

    void (async () => {
      try {
        setContextLoading(true);
        setContextError(null);
        const rows = await listCourses();
        if (!cancelled) {
          setCourses(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setCourses([]);
          setContextError(
            e instanceof Error ? e.message : "Failed to load upload context"
          );
        }
      } finally {
        if (!cancelled) setContextLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canUpload]);

  const moduleOptions = useMemo(
    () => buildUploadModuleOptions(courses, role),
    [courses, role]
  );
  const courseOptions = useMemo(
    () => buildUploadCourseOptions(courses, moduleOptions),
    [courses, moduleOptions]
  );

  useEffect(() => {
    setSelectedCourseId((current) =>
      courseOptions.some((course) => course.id === current)
        ? current
        : (courseOptions.find((course) => course.moduleCount > 0)?.id ??
          courseOptions[0]?.id ??
          "")
    );
  }, [courseOptions]);

  const filteredModuleOptions = useMemo(
    () =>
      moduleOptions.filter((module) => module.courseId === selectedCourseId),
    [moduleOptions, selectedCourseId]
  );

  useEffect(() => {
    setSelectedModuleId((current) =>
      filteredModuleOptions.some((module) => module.id === current)
        ? current
        : (filteredModuleOptions[0]?.id ?? "")
    );
  }, [filteredModuleOptions]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  );
  const selectedModule = useMemo(
    () =>
      filteredModuleOptions.find((module) => module.id === selectedModuleId) ??
      null,
    [filteredModuleOptions, selectedModuleId]
  );

  useEffect(() => {
    if (!isAdmin || uploadKind !== "STUDENT_SUBMISSION" || !selectedModuleId) {
      setModuleStudentTargets([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const rows = await listAttendanceModuleStudents(selectedModuleId);
        if (cancelled) return;
        setModuleStudentTargets(
          rows.map((student) => ({
            id: student.id,
            email: student.email,
            role: "STUDENT",
            label: studentTargetLabel(student),
          }))
        );
      } catch (e) {
        if (!cancelled) {
          setModuleStudentTargets([]);
          setContextError(
            e instanceof Error
              ? e.message
              : "Failed to load students for the selected module"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, selectedModuleId, uploadKind]);

  const targetOptions = useMemo<UploadTargetOption[]>(() => {
    if (!isAdmin) return [];
    if (uploadKind === "STUDENT_SUBMISSION") return moduleStudentTargets;
    return (selectedModule?.lecturers ?? []).map((lecturer) => ({
      id: lecturer.id,
      email: lecturer.email,
      role: "LECTURER",
      label: lecturer.email,
    }));
  }, [isAdmin, moduleStudentTargets, selectedModule, uploadKind]);

  useEffect(() => {
    if (!isAdmin) return;

    if (uploadKind === "LECTURER_MATERIAL") {
      setTargetUserId((current) =>
        current && targetOptions.some((option) => option.id === current)
          ? current
          : ""
      );
      return;
    }

    setTargetUserId((current) =>
      targetOptions.some((option) => option.id === current)
        ? current
        : (targetOptions[0]?.id ?? "")
    );
  }, [isAdmin, targetOptions, uploadKind]);

  const subtitle = useMemo(() => {
    if (isAdmin) {
      return "Choose a course and module first, then upload the file into the correct academic context.";
    }
    if (role === "LECTURER") {
      return "Choose one of your assigned teaching modules before uploading lecturer material.";
    }
    if (role === "PARENT") {
      return "View submissions and shared files tied to your approved child links.";
    }
    if (role === "STUDENT") {
      return "Choose one of your enrolled modules before uploading a student submission.";
    }
    return "View and download shared lecturer materials.";
  }, [isAdmin, role]);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!canUpload) {
      setError("Only students, lecturers, or admin can upload.");
      return;
    }

    if (!selectedCourseId) {
      setError(noCourseMessage(role));
      return;
    }

    if (!selectedModuleId) {
      setError(noModuleMessage(role));
      return;
    }

    if (!file) {
      setError("Please choose a file first.");
      return;
    }

    if (isAdmin && uploadKind === "STUDENT_SUBMISSION" && !targetUserId) {
      setError("Select a student first.");
      return;
    }

    setBusy(true);

    try {
      await uploadFile({
        file,
        kind: uploadKind,
        targetUserId: isAdmin && targetUserId ? targetUserId : undefined,
        courseId: selectedCourseId,
        moduleId: selectedModuleId,
      });
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(uploadId: string) {
    if (!canDelete) return;

    setError(null);
    setDeletingId(uploadId);

    try {
      await deleteUpload({ uploadId });
      setItems((prev) => prev.filter((u) => u.id !== uploadId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete upload");
    } finally {
      setDeletingId(null);
    }
  }

  const disableUpload =
    busy ||
    contextLoading ||
    !selectedModuleId ||
    (isAdmin &&
      uploadKind === "STUDENT_SUBMISSION" &&
      targetOptions.length === 0);

  return (
    <div>
      <PageHeader title="Uploads" subtitle={subtitle} />

      <div
        className={`mt-6 grid grid-cols-1 gap-6 ${
          canUpload ? "lg:grid-cols-[460px_1fr]" : ""
        }`}
      >
        {canUpload && (
          <div className="teal-glow-card p-5">
            <div className="text-lg font-semibold text-white">
              Upload a file
            </div>
            <div className="mt-1 text-sm text-white/72">
              {uploadKind === "STUDENT_SUBMISSION"
                ? isAdmin
                  ? "Student submissions stay tied to the selected course, module, and student."
                  : "Student submissions stay tied to the selected course and module."
                : isAdmin
                  ? "Lecturer materials are saved against the selected course and module, with an optional lecturer target."
                  : "Lecturer materials are saved against the selected course and module."}
            </div>

            <form onSubmit={onUpload} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="upload-kind"
                  className="block text-sm text-white/80"
                >
                  Type
                </label>
                {isAdmin ? (
                  <select
                    id="upload-kind"
                    value={uploadKind}
                    onChange={(e) => setUploadKind(e.target.value as UploadKind)}
                    disabled={busy}
                    className="select-glass mt-2"
                    aria-label="Upload type"
                    title="Upload type"
                  >
                    <option value="LECTURER_MATERIAL">Lecturer material</option>
                    <option value="STUDENT_SUBMISSION">
                      Student submission
                    </option>
                  </select>
                ) : (
                  <input
                    id="upload-kind"
                    value={kindLabel(uploadKind)}
                    readOnly
                    className="input-glass mt-2"
                    aria-label="Upload type"
                    title="Upload type"
                  />
                )}
              </div>

              <div>
                <label
                  htmlFor="upload-course"
                  className="block text-sm text-white/80"
                >
                  Course
                </label>
                <select
                  id="upload-course"
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  disabled={busy || contextLoading || courseOptions.length === 0}
                  className="select-glass mt-2"
                  aria-label="Upload course"
                  title="Upload course"
                >
                  {courseOptions.length === 0 ? (
                    <option value="">No courses available</option>
                  ) : (
                    courseOptions.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.label}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="upload-module"
                  className="block text-sm text-white/80"
                >
                  Module
                </label>
                <select
                  id="upload-module"
                  value={selectedModuleId}
                  onChange={(e) => setSelectedModuleId(e.target.value)}
                  disabled={
                    busy || contextLoading || filteredModuleOptions.length === 0
                  }
                  className="select-glass mt-2"
                  aria-label="Upload module"
                  title="Upload module"
                >
                  {filteredModuleOptions.length === 0 ? (
                    <option value="">No modules available for this course</option>
                  ) : (
                    filteredModuleOptions.map((module) => (
                      <option key={module.id} value={module.id}>
                        {module.label}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {isAdmin && (
                <div>
                  <label
                    htmlFor="upload-target"
                    className="block text-sm text-white/80"
                  >
                    {uploadKind === "STUDENT_SUBMISSION"
                      ? "For student"
                      : "For lecturer (optional)"}
                  </label>
                  <select
                    id="upload-target"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    disabled={
                      busy ||
                      contextLoading ||
                      (uploadKind === "STUDENT_SUBMISSION" &&
                        targetOptions.length === 0)
                    }
                    className="select-glass mt-2"
                    aria-label="Upload target"
                    title="Upload target"
                  >
                    {uploadKind === "LECTURER_MATERIAL" ? (
                      <>
                        <option value="">Shared with selected module</option>
                        {targetOptions.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.label}
                          </option>
                        ))}
                      </>
                    ) : targetOptions.length === 0 ? (
                      <option value="">
                        No students linked to this module
                      </option>
                    ) : (
                      targetOptions.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              <div className="rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.56)] p-3 text-sm text-white/75">
                {selectedCourse && selectedModule
                  ? `Uploading into ${selectedCourse.code} - ${selectedCourse.name} | ${selectedModule.label}`
                  : selectedCourse
                    ? `${selectedCourse.code} - ${selectedCourse.name} is selected. Choose a module next.`
                    : "Choose a course, then a module, before uploading."}
              </div>

              {contextLoading && (
                <div className="info-banner">Loading your course and module options...</div>
              )}

              {contextError && <div className="error-banner">{contextError}</div>}

              {!contextLoading && courseOptions.length === 0 && (
                <div className="rounded-2xl border border-[rgba(255,196,87,0.24)] bg-[rgba(97,59,9,0.45)] p-3 text-sm text-[#ffe8b0]">
                  {noCourseMessage(role)}
                </div>
              )}

              {!contextLoading &&
                courseOptions.length > 0 &&
                filteredModuleOptions.length === 0 && (
                  <div className="rounded-2xl border border-[rgba(255,196,87,0.24)] bg-[rgba(97,59,9,0.45)] p-3 text-sm text-[#ffe8b0]">
                    {noModuleMessage(role)}
                  </div>
                )}

              {isAdmin &&
                uploadKind === "STUDENT_SUBMISSION" &&
                selectedModuleId &&
                targetOptions.length === 0 && (
                  <div className="rounded-2xl border border-[rgba(255,196,87,0.24)] bg-[rgba(97,59,9,0.45)] p-3 text-sm text-[#ffe8b0]">
                    No students are linked to this module yet. Enroll the learner into the module before uploading on their behalf.
                  </div>
                )}

              <div>
                <label
                  htmlFor="upload-file"
                  className="block text-sm text-white/80"
                >
                  File
                </label>
                <input
                  id="upload-file"
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-sm text-white file:mr-4 file:rounded-xl file:border file:file:border-[rgba(140,235,255,0.18)] file:file:bg-[rgba(8,18,48,0.86)] file:file:px-4 file:file:py-2 file:file:text-white file:file:transition-all file:file:duration-200 hover:file:file:border-[rgba(140,235,255,0.34)] hover:file:file:bg-[rgba(14,42,99,0.75)]"
                  disabled={busy}
                  aria-label="Choose file to upload"
                  title="Choose file to upload"
                />
              </div>

              {error && <div className="error-banner">{error}</div>}

              <button
                type="submit"
                disabled={disableUpload}
                className="btn-primary w-full"
                title="Upload selected file"
                aria-label="Upload selected file"
              >
                {busy ? "Uploading..." : "Upload"}
              </button>
            </form>
          </div>
        )}

        <div className="teal-glow-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Files</div>
              <div className="mt-1 text-sm text-white/72">
                {canDelete
                  ? "You can review uploads across your allowed academic scope."
                  : role === "PARENT"
                    ? "You can view uploads linked to your approved children."
                  : canUpload
                    ? "You can view lecturer materials and submissions within your allowed academic scope."
                    : "You can view materials your role is allowed to access."}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              className="btn-secondary"
              title="Refresh uploads"
              aria-label="Refresh uploads"
            >
              Refresh
            </button>
          </div>

          {!canUpload && error && <div className="error-banner mt-4">{error}</div>}

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="text-white/75">Loading...</div>
            ) : items.length === 0 ? (
              <div className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.62)] p-6 text-white/80">
                {role === "PARENT"
                  ? "No uploads are linked to your approved children yet."
                  : "No files are available in your current academic scope yet."}
              </div>
            ) : (
              items.map((u) => (
                <div
                  key={u.id}
                  className="rounded-3xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.66)] p-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[rgba(140,235,255,0.34)] hover:bg-[rgba(14,42,99,0.62)] hover:shadow-[0_0_18px_rgba(140,235,255,0.10)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">
                        {u.fileName}
                      </div>

                      <div className="mt-1 text-xs text-white/70">
                        {kindLabel(u.kind)} - {prettySize(u.size)} -{" "}
                        {new Date(u.uploadedAt).toLocaleString()}
                      </div>

                      <div className="mt-1 text-xs text-white/60">
                        Uploaded by: {u.uploaderEmail}
                      </div>
                      <div className="mt-1 text-xs text-white/60">
                        Context: {uploadContextLabel(u)}
                      </div>
                      {u.targetUserEmail && (
                        <div className="mt-1 text-xs text-white/60">
                          For: {u.targetUserEmail}
                          {u.targetUserRole
                            ? ` (${u.targetUserRole.toLowerCase()})`
                            : ""}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void downloadUpload({
                            uploadId: u.id,
                            fileName: u.fileName,
                          })
                        }
                        className="btn-primary px-3 py-2 text-xs"
                        title={`Download ${u.fileName}`}
                        aria-label={`Download ${u.fileName}`}
                      >
                        Download
                      </button>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void onDelete(u.id)}
                          disabled={deletingId === u.id}
                          className="btn-danger px-3 py-2 text-xs disabled:opacity-60"
                          title={`Delete ${u.fileName}`}
                          aria-label={`Delete ${u.fileName}`}
                        >
                          {deletingId === u.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 text-xs text-white/60">
            Logged in as: {email} ({role})
          </div>
        </div>
      </div>
    </div>
  );
}
