import { apiClient } from "./apiClient";
import { apiDownload } from "./api";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";

export type AttendanceModule = {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  code: string;
  name: string;
  facultyName: string;
  enrolledCount: number;
  lecturers: Array<{ id: string; email: string }>;
};

export type AttendanceModuleStudent = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  courseName: string | null;
  studentNumber: string | null;
};

export type AttendanceDirectoryUserRole = "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";

export type AttendanceDirectoryUser = {
  id: string;
  email: string;
  role: AttendanceDirectoryUserRole;
};

export type AttendanceSession = {
  id: string;
  lecturerId: string;
  lecturer?: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  moduleId: string;
  courseId?: string | null;
  courseName?: string | null;
  moduleCode: string;
  moduleName: string;
  facultyName: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  attendanceOpenAt?: string | null;
  attendanceCloseAt?: string | null;
  finalizedAt?: string | null;
  createdAt: string;
  checkedInAt: string | null;
  checkedInCount: number;
  summary?: AttendanceSummary & {
    pending?: number;
    attendancePercentage?: number | null;
  };
};

export type AttendanceSessionRosterStudent = AttendanceModuleStudent & {
  checkedInAt: string | null;
  currentStatus: AttendanceStatus | null;
  markedAt: string | null;
  suggestedStatus: AttendanceStatus;
};

export type AttendanceSummary = {
  present: number;
  absent: number;
  late: number;
  total: number;
};

export type AttendanceMeRecord = {
  sessionId: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  facultyName: string;
  status: AttendanceStatus;
  markedAt: string;
};

export type AttendanceMeResponse = {
  student: {
    id: string;
    email?: string;
    firstName?: string | null;
    lastName?: string | null;
    courseName?: string | null;
    studentNumber?: string | null;
  };
  summary: AttendanceSummary;
  value: AttendanceMeRecord[];
  count: number;
};

export async function listAttendanceModules(): Promise<AttendanceModule[]> {
  const data = await apiClient.get<{ value: AttendanceModule[] }>("/attendance/modules");
  return Array.isArray(data.value) ? data.value : [];
}

export async function listAttendanceModuleStudents(moduleId: string): Promise<AttendanceModuleStudent[]> {
  const data = await apiClient.get<{ value: AttendanceModuleStudent[] }>(
    `/attendance/modules/${encodeURIComponent(moduleId)}/students`
  );
  return Array.isArray(data.value) ? data.value : [];
}

export async function listAttendanceDirectoryUsers(params?: {
  roles?: AttendanceDirectoryUserRole[];
  q?: string;
  limit?: number;
}): Promise<AttendanceDirectoryUser[]> {
  const qs = new URLSearchParams();
  if (params?.roles?.length) {
    for (const role of params.roles) qs.append("role", role);
  }
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const data = await apiClient.get<{ value: AttendanceDirectoryUser[] }>(`/users${suffix}`);
  return Array.isArray(data.value) ? data.value : [];
}

export async function createAttendanceModule(input: {
  courseId: string;
  code: string;
  name: string;
  facultyName: string;
}) {
  return apiClient.post<{
    id: string;
    facultyId: string;
    courseId: string;
    code: string;
    name: string;
  }>("/attendance/modules", input);
}

export async function createAttendanceSession(input: {
  moduleId: string;
  date?: string;
  startsAt?: string;
  endsAt?: string;
  lecturerId?: string;
}) {
  return apiClient.post<{
    id: string;
    lecturerId: string;
    moduleId: string;
    date: string;
    startsAt: string | null;
    endsAt: string | null;
    createdAt: string;
  }>("/attendance/sessions", input);
}

export async function listAttendanceSessions(params?: { date?: string; moduleId?: string }) {
  const qs = new URLSearchParams();
  if (params?.date) qs.set("date", params.date);
  if (params?.moduleId) qs.set("moduleId", params.moduleId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const data = await apiClient.get<{ value: AttendanceSession[] }>(`/attendance/sessions${suffix}`);
  return Array.isArray(data.value) ? data.value : [];
}

export async function getAttendanceSession(sessionId: string): Promise<AttendanceSession> {
  const data = await apiClient.get<{ session: AttendanceSession }>(
    `/attendance/sessions/${encodeURIComponent(sessionId)}`
  );
  return data.session;
}

export async function listAttendanceSessionRoster(sessionId: string): Promise<AttendanceSessionRosterStudent[]> {
  const data = await apiClient.get<{ value: AttendanceSessionRosterStudent[] }>(
    `/attendance/sessions/${encodeURIComponent(sessionId)}/roster`
  );
  return Array.isArray(data.value) ? data.value : [];
}

export async function checkInToAttendanceSession(sessionId: string) {
  return apiClient.post<{
    ok: boolean;
    created: boolean;
    checkedInAt: string | null;
    suggestedStatus: AttendanceStatus;
  }>(`/attendance/sessions/${encodeURIComponent(sessionId)}/check-in`);
}

export async function markAttendanceSession(
  sessionId: string,
  rows: Array<{ studentId: string; status: AttendanceStatus }>
) {
  return apiClient.post<{
    ok: boolean;
    count: number;
    value: Array<{
      sessionId: string;
      studentId: string;
      status: AttendanceStatus;
      markedAt: string;
      markedBy: string;
    }>;
  }>(`/attendance/sessions/${encodeURIComponent(sessionId)}/mark`, rows);
}

export async function assignLecturerToAttendanceModule(moduleId: string, lecturerId: string) {
  return apiClient.post<{ ok: boolean; created: boolean }>(
    `/attendance/modules/${encodeURIComponent(moduleId)}/lecturers`,
    { lecturerId }
  );
}

export async function removeLecturerFromAttendanceModule(moduleId: string, lecturerId: string) {
  return apiClient.delete<{ ok: boolean }>(
    `/attendance/modules/${encodeURIComponent(moduleId)}/lecturers/${encodeURIComponent(lecturerId)}`
  );
}

export async function enrollStudentInAttendanceModule(moduleId: string, studentId: string) {
  return apiClient.post<{ ok: boolean; created: boolean }>(
    `/attendance/modules/${encodeURIComponent(moduleId)}/enrollments`,
    { studentId }
  );
}

export async function removeStudentFromAttendanceModule(moduleId: string, studentId: string) {
  return apiClient.delete<{ ok: boolean }>(
    `/attendance/modules/${encodeURIComponent(moduleId)}/enrollments/${encodeURIComponent(studentId)}`
  );
}

export async function getMyAttendance(params?: { from?: string; to?: string; childId?: string }) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.childId) qs.set("childId", params.childId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiClient.get<AttendanceMeResponse>(`/attendance/me${suffix}`);
}

export async function downloadAttendanceExport(params: {
  from: string;
  to: string;
  moduleId?: string;
  childId?: string;
  studentId?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("from", params.from);
  qs.set("to", params.to);
  if (params.moduleId?.trim()) qs.set("moduleId", params.moduleId.trim());
  if (params.childId?.trim()) qs.set("childId", params.childId.trim());
  if (params.studentId?.trim()) qs.set("studentId", params.studentId.trim());
  return apiDownload(`/api/attendance/export?${qs.toString()}`);
}
