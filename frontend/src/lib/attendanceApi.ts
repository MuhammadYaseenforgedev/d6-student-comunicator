import { apiClient } from "./apiClient";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";

export type AttendanceModule = {
  id: string;
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

export type AttendanceSession = {
  id: string;
  lecturerId: string;
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  facultyName: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
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

export async function getMyAttendance(params?: { from?: string; to?: string; childId?: string }) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.childId) qs.set("childId", params.childId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiClient.get<AttendanceMeResponse>(`/attendance/me${suffix}`);
}
