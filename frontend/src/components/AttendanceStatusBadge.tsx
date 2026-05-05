import {
  ATTENDANCE_STATUS_STYLES,
  normalizeAttendanceStatus,
} from "../lib/attendanceStatus";

export default function AttendanceStatusBadge({
  status,
  className = "",
}: {
  status: unknown;
  className?: string;
}) {
  const normalized = normalizeAttendanceStatus(status) ?? "PENDING";
  const styles = ATTENDANCE_STATUS_STYLES[normalized];

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        styles.badgeClassName,
        className,
      ].join(" ")}
    >
      {styles.label}
    </span>
  );
}
