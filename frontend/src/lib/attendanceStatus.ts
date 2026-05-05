export type AttendanceDisplayStatus = "PRESENT" | "LATE" | "ABSENT" | "PENDING";

export const ATTENDANCE_STATUS_STYLES: Record<
  AttendanceDisplayStatus,
  { label: string; badgeClassName: string; textClassName: string }
> = {
  PRESENT: {
    label: "Present",
    badgeClassName: "border-emerald-400/25 bg-emerald-500/12 text-emerald-200",
    textClassName: "text-emerald-300",
  },
  LATE: {
    label: "Late",
    badgeClassName: "border-amber-400/25 bg-amber-500/12 text-amber-200",
    textClassName: "text-amber-300",
  },
  ABSENT: {
    label: "Absent",
    badgeClassName: "border-rose-400/25 bg-rose-500/12 text-rose-200",
    textClassName: "text-rose-300",
  },
  PENDING: {
    label: "Pending",
    badgeClassName: "border-white/15 bg-white/8 text-white/72",
    textClassName: "text-white/72",
  },
};

export function normalizeAttendanceStatus(
  status: unknown
): AttendanceDisplayStatus | null {
  const normalized = String(status ?? "").trim().toUpperCase();
  return normalized in ATTENDANCE_STATUS_STYLES
    ? (normalized as AttendanceDisplayStatus)
    : null;
}

export function attendanceStatusTextClass(status: unknown): string {
  const normalized = normalizeAttendanceStatus(status);
  return normalized
    ? ATTENDANCE_STATUS_STYLES[normalized].textClassName
    : "text-white/70";
}
