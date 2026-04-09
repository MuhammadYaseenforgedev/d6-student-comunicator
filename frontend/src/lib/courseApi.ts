import { apiClient } from "./apiClient";

export type CourseModule = {
  id: string;
  code: string;
  name: string;
  facultyName: string;
  enrolledCount: number;
  lecturers: Array<{ id: string; email: string }>;
  isStudentLinked: boolean;
};

export type CourseStudent = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  studentNumber: string | null;
  status: string;
  enrolledAt: string;
};

export type CourseRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  enrollmentStatus: string | null;
  enrolledAt: string | null;
  summary: {
    moduleCount: number;
    studentCount: number;
    lecturerCount: number;
    linkedModuleCount: number;
  };
  modules: CourseModule[];
  students: CourseStudent[];
};

export async function listCourses(): Promise<CourseRecord[]> {
  const data = await apiClient.get<{ value: CourseRecord[] }>("/courses");
  return Array.isArray(data.value) ? data.value : [];
}

export async function createCourse(input: {
  code: string;
  name: string;
  description?: string;
}) {
  return apiClient.post<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>("/courses", input);
}

export async function updateCourse(
  courseId: string,
  input: Partial<{
    code: string;
    name: string;
    description: string;
    isActive: boolean;
  }>
) {
  return apiClient.patch<{
    ok: boolean;
    course: {
      id: string;
      code: string;
      name: string;
      description: string | null;
      isActive: boolean;
      createdAt: string;
      updatedAt: string;
    };
  }>(`/courses/${encodeURIComponent(courseId)}`, input);
}

export async function assignModuleToCourse(courseId: string, moduleId: string) {
  return apiClient.post<{ ok: boolean }>(
    `/courses/${encodeURIComponent(courseId)}/modules`,
    { moduleId }
  );
}

export async function removeCourseModule(courseId: string, moduleId: string) {
  return apiClient.delete<{
    ok: boolean;
    moduleId: string;
    code: string;
    name: string;
  }>(`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}`);
}

export async function enrollStudentInCourse(
  courseId: string,
  studentId: string,
  status: "ACTIVE" | "INACTIVE" = "ACTIVE"
) {
  return apiClient.post<{ ok: boolean }>(
    `/courses/${encodeURIComponent(courseId)}/enrollments`,
    { studentId, status }
  );
}

export async function removeStudentFromCourse(courseId: string, studentId: string) {
  return apiClient.delete<{ ok: boolean }>(
    `/courses/${encodeURIComponent(courseId)}/enrollments/${encodeURIComponent(studentId)}`
  );
}
