import { apiClient } from "./apiClient";

export type StudentCourseOption = {
  id: string;
  code: string;
  name: string;
};

export type StudentProfileDetail = {
  userId: string;
  email: string;
  fullName: string;
  surname: string;
  studentNumber: string;
  idNumber: string;
  dateOfBirth: string | null;
  mobileNumber: string;
  alternativeContactNumber: string | null;
  streetAddress: string;
  city: string;
  province: string;
  postalCode: string;
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
  feeStatus: "PAID" | "PARTIAL" | "OUTSTANDING" | "";
  paymentMethod: string;
  amountDue: number | null;
  amountPaid: number | null;
  lastPaymentDate: string | null;
  paymentReference: string | null;
  courseId: string | null;
  courseCode: string | null;
  courseName: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  isComplete: boolean;
  missingFields: string[];
};

export type StudentProfileListItem = {
  userId: string;
  email: string;
  fullName: string;
  surname: string;
  studentNumber: string;
  idNumber: string;
  courseId: string | null;
  courseCode: string | null;
  courseName: string | null;
  isComplete: boolean;
};

export async function getMyStudentProfile() {
  return apiClient.get<{
    profile: StudentProfileDetail;
    availableCourses: StudentCourseOption[];
  }>("/student/profile");
}

export async function saveMyStudentProfile(input: {
  fullName: string;
  surname: string;
  studentNumber: string;
  idNumber: string;
  dateOfBirth?: string | null;
  mobileNumber: string;
  alternativeContactNumber?: string | null;
  streetAddress: string;
  city: string;
  province: string;
  postalCode: string;
  emergencyContactName?: string | null;
  emergencyContactNumber?: string | null;
  courseId?: string | null;
}) {
  return apiClient.put<{
    ok: boolean;
    profile: StudentProfileDetail;
    availableCourses: StudentCourseOption[];
  }>("/student/profile", input);
}

export async function listStudentProfiles(params?: {
  q?: string;
  courseId?: string;
  limit?: number;
}): Promise<StudentProfileListItem[]> {
  const qs = new URLSearchParams();
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.courseId?.trim()) qs.set("courseId", params.courseId.trim());
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const data = await apiClient.get<{ value: StudentProfileListItem[] }>(`/students${suffix}`);
  return Array.isArray(data.value) ? data.value : [];
}

export async function getStudentProfileDetail(studentId: string): Promise<StudentProfileDetail> {
  const data = await apiClient.get<{ profile: StudentProfileDetail }>(
    `/students/${encodeURIComponent(studentId)}`
  );
  return data.profile;
}
