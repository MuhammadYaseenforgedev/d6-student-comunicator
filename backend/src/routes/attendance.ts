import { Router } from "express";
import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { requireAccess, requireRole } from "../middleware/rbac";
import {
  createAbsenceFollowUpEventsForSession,
  createPreSessionReminderEventsForSession,
} from "../lib/attendanceNotificationEvents";
import { createAttendanceNotifications } from "../lib/notifications";
import {
  isLecturerAssignedToCourse,
  isLecturerAssignedToModule,
  isStudentActiveInCourse,
  isStudentAllowedForModule,
} from "../lib/courseAccess";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";
type AttendanceRecordStatus = AttendanceStatus | "PENDING";
const VALID_ATTENDANCE_STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE"];
const VALID_ATTENDANCE_RECORD_STATUSES: AttendanceRecordStatus[] = [
  "PENDING",
  ...VALID_ATTENDANCE_STATUSES,
];

type AttendanceSessionContext = {
  id: string;
  lecturer_id: string;
  module_id: string;
  course_id: string | null;
  calendar_entry_id: string | null;
  course_schedule_template_id: string | null;
  attendance_date: string;
  starts_at: string | null;
  ends_at: string | null;
  attendance_open_at: string | null;
  attendance_close_at: string | null;
  lateness_threshold_minutes: number;
  finalized_at: string | null;
};

type Queryable = Pick<PoolClient, "query"> | typeof pool;

type CalendarAttendanceSource = {
  id: string;
  course_id: string;
  module_id: string | null;
  course_schedule_template_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  event_source: string;
};

type AttendanceSessionRow = {
  id: string;
  lecturer_id: string;
  module_id: string;
  course_id: string | null;
  calendar_entry_id: string | null;
  course_schedule_template_id: string | null;
  attendance_date: string;
  starts_at: string | null;
  ends_at: string | null;
  attendance_open_at: string | null;
  attendance_close_at: string | null;
  lateness_threshold_minutes: number;
  session_source: string;
  finalized_at: string | null;
  created_at: string;
};

type AttendanceSummaryCounts = {
  total_count: number | string | null;
  present_count: number | string | null;
  late_count: number | string | null;
  absent_count: number | string | null;
  pending_count: number | string | null;
};

type AttendanceSessionOperationalRow = AttendanceSummaryCounts & {
  id: string;
  lecturer_id: string;
  lecturer_email: string | null;
  lecturer_first_name: string | null;
  lecturer_last_name: string | null;
  module_id: string;
  module_code: string;
  module_name: string;
  faculty_name: string | null;
  course_id: string | null;
  course_name: string | null;
  calendar_entry_id: string | null;
  course_schedule_template_id: string | null;
  attendance_date: string;
  starts_at: string | null;
  ends_at: string | null;
  attendance_open_at: string | null;
  attendance_close_at: string | null;
  lateness_threshold_minutes: number | string | null;
  session_source: string;
  finalized_at: string | null;
  finalized_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  checked_in_at?: string | null;
  checked_in_count?: number | string | null;
  filtered_count?: number | string | null;
};

type AttendanceRecordOperationalRow = {
  session_id: string;
  student_id: string;
  status: AttendanceRecordStatus;
  marked_at: string | null;
  marked_by: string | null;
  status_reason: string | null;
  attendance_source: string | null;
  updated_at: string | null;
  learner_email: string;
  learner_first_name: string | null;
  learner_last_name: string | null;
  public_student_id: string | null;
  learner_name: string;
  checked_in_at: string | null;
  marker_email: string | null;
  marker_first_name: string | null;
  marker_last_name: string | null;
  marker_name: string | null;
};

type AttendanceMarkInput = {
  studentId?: unknown;
  status?: unknown;
  markedAt?: unknown;
  marked_at?: unknown;
  statusReason?: unknown;
  status_reason?: unknown;
};

type ParsedAttendanceMark = {
  studentId: string;
  status: AttendanceStatus | null;
  markedAt: string;
  statusReason: string;
};

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function parseDateOnly(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parseDateTime(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const timestamp = Date.parse(s);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function parseOptionalDateTime(raw: unknown): string | null | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return parseDateTime(s) ?? undefined;
}

function parseBoolean(raw: unknown): boolean | null | undefined {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (["true", "1", "yes"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;
  return null;
}

function parseOptionalNonNegativeInt(raw: unknown, max = 1000): number | null | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > max) return null;
  return n;
}

function parseLatenessThresholdMinutes(raw: unknown, fallback = 10): number | null {
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1440) return null;
  return Math.floor(n);
}

function compareDateOnly(a: string, b: string): number {
  return Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
}

function normalizeStatus(raw: unknown): AttendanceStatus | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return VALID_ATTENDANCE_STATUSES.includes(s as AttendanceStatus) ? (s as AttendanceStatus) : null;
}

function normalizeRecordStatus(raw: unknown): AttendanceRecordStatus | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return VALID_ATTENDANCE_RECORD_STATUSES.includes(s as AttendanceRecordStatus)
    ? (s as AttendanceRecordStatus)
    : null;
}

function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  if (!/[",\n\r]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function inferTimedAttendanceStatus(
  session: Pick<AttendanceSessionContext, "starts_at" | "lateness_threshold_minutes">,
  markedAt: string
): AttendanceStatus {
  if (!session.starts_at) return "PRESENT";

  const startMs = Date.parse(session.starts_at);
  const markedMs = Date.parse(markedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(markedMs)) return "PRESENT";

  const lateAfterMs = startMs + Number(session.lateness_threshold_minutes ?? 10) * 60 * 1000;
  return markedMs > lateAfterMs ? "LATE" : "PRESENT";
}

function mapAttendanceSession(row: AttendanceSessionRow, created: boolean) {
  return {
    id: row.id,
    lecturerId: row.lecturer_id,
    moduleId: row.module_id,
    courseId: row.course_id,
    calendarEntryId: row.calendar_entry_id,
    courseScheduleTemplateId: row.course_schedule_template_id,
    date: row.attendance_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    attendanceOpenAt: row.attendance_open_at,
    attendanceCloseAt: row.attendance_close_at,
    latenessThresholdMinutes: Number(row.lateness_threshold_minutes ?? 10),
    sessionSource: row.session_source,
    finalizedAt: row.finalized_at,
    createdAt: row.created_at,
    created,
  };
}

function mapAttendanceSummary(row: AttendanceSummaryCounts) {
  const present = Number(row.present_count ?? 0);
  const late = Number(row.late_count ?? 0);
  const absent = Number(row.absent_count ?? 0);
  const pending = Number(row.pending_count ?? 0);
  const total = Number(row.total_count ?? 0);
  const resolvedTotal = present + late + absent;

  return {
    total,
    present,
    late,
    absent,
    pending,
    attendancePercentage:
      resolvedTotal > 0 ? Math.round(((present + late) / resolvedTotal) * 10000) / 100 : null,
  };
}

function mapOperationalSession(row: AttendanceSessionOperationalRow) {
  return {
    id: row.id,
    lecturerId: row.lecturer_id,
    lecturer: {
      id: row.lecturer_id,
      email: row.lecturer_email,
      firstName: row.lecturer_first_name,
      lastName: row.lecturer_last_name,
    },
    moduleId: row.module_id,
    moduleCode: row.module_code,
    moduleName: row.module_name,
    facultyName: row.faculty_name,
    courseId: row.course_id,
    courseName: row.course_name,
    calendarEntryId: row.calendar_entry_id,
    courseScheduleTemplateId: row.course_schedule_template_id,
    date: row.attendance_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    attendanceOpenAt: row.attendance_open_at,
    attendanceCloseAt: row.attendance_close_at,
    latenessThresholdMinutes: Number(row.lateness_threshold_minutes ?? 10),
    sessionSource: row.session_source,
    finalizedAt: row.finalized_at,
    finalizedBy: row.finalized_by,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    checkedInAt: row.checked_in_at ?? null,
    checkedInCount: Number(row.checked_in_count ?? 0),
    summary: mapAttendanceSummary(row),
  };
}

async function isStudentEnrolledInModule(studentId: string, moduleId: string): Promise<boolean> {
  return isStudentAllowedForModule(pool, studentId, moduleId);
}

function inferSuggestedStatus(
  startsAt: string | null,
  checkedInAt: string | null,
  latenessThresholdMinutes = 0
): AttendanceStatus {
  if (!checkedInAt) return "ABSENT";
  if (!startsAt) return "PRESENT";

  const startsAtMs = Date.parse(startsAt);
  const checkedInAtMs = Date.parse(checkedInAt);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(checkedInAtMs)) return "PRESENT";
  const lateAfterMs = startsAtMs + latenessThresholdMinutes * 60 * 1000;
  return checkedInAtMs > lateAfterMs ? "LATE" : "PRESENT";
}

async function getAttendanceSessionContext(sessionId: string): Promise<AttendanceSessionContext | null> {
  const r = await pool.query<AttendanceSessionContext>(
    `
      SELECT
        id,
        lecturer_id,
        module_id,
        course_id,
        calendar_entry_id,
        course_schedule_template_id,
        attendance_date,
        starts_at::text AS starts_at,
        ends_at::text AS ends_at,
        attendance_open_at::text AS attendance_open_at,
        attendance_close_at::text AS attendance_close_at,
        lateness_threshold_minutes,
        finalized_at::text AS finalized_at
      FROM attendance_sessions
      WHERE id = $1
      LIMIT 1
    `,
    [sessionId]
  );
  return (r.rowCount ?? 0) > 0 ? r.rows[0] : null;
}

async function canLecturerManageModule(userId: string, moduleId: string): Promise<boolean> {
  return isLecturerAssignedToModule(pool, userId, moduleId);
}

async function canLecturerManageCourse(userId: string, courseId: string): Promise<boolean> {
  return isLecturerAssignedToCourse(pool, userId, courseId);
}

async function canStaffAccessAttendanceSession(
  user: { id: string; role: string },
  session: Pick<AttendanceSessionContext, "module_id">
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (user.role !== "LECTURER") return false;
  return canLecturerManageModule(user.id, session.module_id);
}

async function ensureParentCanAccessChild(parentId: string, childId: string): Promise<boolean> {
  const q = `
    SELECT 1
    FROM parent_links
    WHERE parent_user_id = $1
      AND student_user_id = $2
    LIMIT 1
  `;
  const r = await pool.query(q, [parentId, childId]);
  return (r.rowCount ?? 0) > 0;
}

async function loadCalendarAttendanceSource(
  calendarEntryId: string
): Promise<CalendarAttendanceSource | null> {
  const result = await pool.query<CalendarAttendanceSource>(
    `
      SELECT
        ce.id,
        ce.course_id,
        ce.module_id,
        ce.course_schedule_template_id,
        ce.title,
        ce.starts_at::text AS starts_at,
        ce.ends_at::text AS ends_at,
        COALESCE(ce.event_source, 'INTERNAL') AS event_source
      FROM calendar_entries ce
      WHERE ce.id = $1
        AND ce.course_id IS NOT NULL
      LIMIT 1
    `,
    [calendarEntryId]
  );

  return result.rows[0] ?? null;
}

async function seedPendingAttendanceRecords(
  db: Queryable,
  input: { sessionId: string; moduleId: string }
): Promise<number> {
  const result = await db.query<{ inserted_count: number }>(
    `
      WITH roster AS (
        SELECT DISTINCT sme.student_id
        FROM faculty_modules fm
        JOIN student_module_enrollments sme
          ON sme.module_id = fm.id
        JOIN student_courses sc
          ON sc.student_user_id = sme.student_id
         AND sc.course_id = fm.course_id
         AND sc.status = 'ACTIVE'
        WHERE fm.id = $2
      ),
      inserted AS (
        INSERT INTO attendance_records (
          session_id,
          student_id,
          status,
          marked_at,
          marked_by,
          status_reason,
          attendance_source,
          updated_at
        )
        SELECT
          $1,
          roster.student_id,
          'PENDING',
          NULL,
          NULL,
          'SEEDED_FROM_SESSION',
          'SESSION_SEED',
          now()
        FROM roster
        ON CONFLICT (session_id, student_id) DO NOTHING
        RETURNING student_id
      )
      SELECT COUNT(*)::int AS inserted_count
      FROM inserted
    `,
    [input.sessionId, input.moduleId]
  );

  return Number(result.rows[0]?.inserted_count ?? 0);
}

async function loadAttendanceSessionRow(
  db: Queryable,
  sessionId: string
): Promise<AttendanceSessionRow | null> {
  const result = await db.query<AttendanceSessionRow>(
    `
      SELECT
        id,
        lecturer_id,
        module_id,
        course_id,
        calendar_entry_id,
        course_schedule_template_id,
        attendance_date,
        starts_at::text AS starts_at,
        ends_at::text AS ends_at,
        attendance_open_at::text AS attendance_open_at,
        attendance_close_at::text AS attendance_close_at,
        lateness_threshold_minutes,
        session_source,
        finalized_at::text AS finalized_at,
        created_at::text AS created_at
      FROM attendance_sessions
      WHERE id = $1
      LIMIT 1
    `,
    [sessionId]
  );

  return result.rows[0] ?? null;
}

function buildAttendanceCsv(rows: Array<{
  student_name: string;
  student_number: string | null;
  course_name: string | null;
  module_code: string;
  module_name: string;
  attendance_date: string;
  status: AttendanceStatus;
}>): string {
  const summary = {
    present: rows.filter((row) => row.status === "PRESENT").length,
    absent: rows.filter((row) => row.status === "ABSENT").length,
    late: rows.filter((row) => row.status === "LATE").length,
    total: rows.length,
  };

  const lines = [
    `Generated At,${csvCell(new Date().toISOString())}`,
    `Present,${summary.present}`,
    `Late,${summary.late}`,
    `Absent,${summary.absent}`,
    `Total,${summary.total}`,
    "",
    "Student Name,Student Number,Course,Module Code,Module Name,Attendance Date,Status",
  ];

  if (rows.length === 0) {
    lines.push("No attendance records found,,,,,,");
  } else {
    for (const row of rows) {
      lines.push(
        [
          csvCell(row.student_name),
          csvCell(row.student_number),
          csvCell(row.course_name),
          csvCell(row.module_code),
          csvCell(row.module_name),
          csvCell(row.attendance_date),
          csvCell(row.status),
        ].join(",")
      );
    }
  }

  return `\uFEFF${lines.join("\n")}\n`;
}

function buildSessionAttendanceCsv(
  session: AttendanceSessionOperationalRow,
  rows: AttendanceRecordOperationalRow[]
): string {
  const lines = [
    "session_id,course,module,learner_name,learner_email,public_student_id,status,marked_at,status_reason,session_start,session_end",
  ];

  if (rows.length === 0) {
    lines.push(
      [
        csvCell(session.id),
        csvCell(session.course_name),
        csvCell(session.module_name),
        "",
        "",
        "",
        "",
        "",
        "",
        csvCell(session.starts_at),
        csvCell(session.ends_at),
      ].join(",")
    );
  } else {
    for (const row of rows) {
      lines.push(
        [
          csvCell(session.id),
          csvCell(session.course_name),
          csvCell(session.module_name),
          csvCell(row.learner_name),
          csvCell(row.learner_email),
          csvCell(row.public_student_id),
          csvCell(row.status),
          csvCell(row.marked_at),
          csvCell(row.status_reason),
          csvCell(session.starts_at),
          csvCell(session.ends_at),
        ].join(",")
      );
    }
  }

  return `\uFEFF${lines.join("\n")}\n`;
}

async function loadOperationalAttendanceSession(
  sessionId: string
): Promise<AttendanceSessionOperationalRow | null> {
  const result = await pool.query<AttendanceSessionOperationalRow>(
    `
      SELECT
        s.id,
        s.lecturer_id,
        lecturer.email AS lecturer_email,
        lecturer.first_name AS lecturer_first_name,
        lecturer.last_name AS lecturer_last_name,
        s.module_id,
        fm.code AS module_code,
        fm.name AS module_name,
        f.name AS faculty_name,
        COALESCE(s.course_id, fm.course_id) AS course_id,
        c.name AS course_name,
        s.calendar_entry_id,
        s.course_schedule_template_id,
        s.attendance_date::text AS attendance_date,
        s.starts_at::text AS starts_at,
        s.ends_at::text AS ends_at,
        s.attendance_open_at::text AS attendance_open_at,
        s.attendance_close_at::text AS attendance_close_at,
        s.lateness_threshold_minutes,
        s.session_source,
        s.finalized_at::text AS finalized_at,
        s.finalized_by,
        s.created_by,
        s.created_at::text AS created_at,
        s.updated_at::text AS updated_at,
        summary.total_count,
        summary.present_count,
        summary.late_count,
        summary.absent_count,
        summary.pending_count
      FROM attendance_sessions s
      JOIN faculty_modules fm ON fm.id = s.module_id
      LEFT JOIN faculties f ON f.id = fm.faculty_id
      LEFT JOIN courses c ON c.id = COALESCE(s.course_id, fm.course_id)
      LEFT JOIN users lecturer ON lecturer.id = s.lecturer_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (WHERE ar.status = 'PRESENT')::int AS present_count,
          COUNT(*) FILTER (WHERE ar.status = 'LATE')::int AS late_count,
          COUNT(*) FILTER (WHERE ar.status = 'ABSENT')::int AS absent_count,
          COUNT(*) FILTER (WHERE ar.status = 'PENDING')::int AS pending_count
        FROM attendance_records ar
        WHERE ar.session_id = s.id
      ) summary ON TRUE
      WHERE s.id = $1
      LIMIT 1
    `,
    [sessionId]
  );

  return result.rows[0] ?? null;
}

async function loadSessionAttendanceRecords(input: {
  sessionId: string;
  status?: AttendanceRecordStatus | null;
  q?: string;
}): Promise<AttendanceRecordOperationalRow[]> {
  const params: unknown[] = [input.sessionId];
  const where = ["ar.session_id = $1"];

  if (input.status) {
    params.push(input.status);
    where.push(`ar.status = $${params.length}`);
  }

  const q = String(input.q ?? "").trim().toLowerCase();
  if (q) {
    params.push(`%${q}%`);
    where.push(`
      (
        lower(u.email) LIKE $${params.length}
        OR lower(COALESCE(u.public_student_id, '')) LIKE $${params.length}
        OR lower(COALESCE(u.first_name, '')) LIKE $${params.length}
        OR lower(COALESCE(u.last_name, '')) LIKE $${params.length}
        OR lower(COALESCE(NULLIF(trim(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), u.email)) LIKE $${params.length}
      )
    `);
  }

  const result = await pool.query<AttendanceRecordOperationalRow>(
    `
      SELECT
        ar.session_id,
        ar.student_id,
        ar.status,
        ar.marked_at::text AS marked_at,
        ar.marked_by,
        ar.status_reason,
        ar.attendance_source,
        ar.updated_at::text AS updated_at,
        u.email AS learner_email,
        u.first_name AS learner_first_name,
        u.last_name AS learner_last_name,
        u.public_student_id,
        COALESCE(NULLIF(trim(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), u.email) AS learner_name,
        ac.checked_in_at::text AS checked_in_at,
        marker.email AS marker_email,
        marker.first_name AS marker_first_name,
        marker.last_name AS marker_last_name,
        COALESCE(NULLIF(trim(CONCAT(COALESCE(marker.first_name, ''), ' ', COALESCE(marker.last_name, ''))), ''), marker.email) AS marker_name
      FROM attendance_records ar
      JOIN users u ON u.id = ar.student_id
      LEFT JOIN attendance_checkins ac
        ON ac.session_id = ar.session_id
       AND ac.student_id = ar.student_id
      LEFT JOIN users marker ON marker.id = ar.marked_by
      WHERE ${where.join(" AND ")}
      ORDER BY lower(u.email) ASC
    `,
    params
  );

  return result.rows;
}

function mapOperationalAttendanceRecord(row: AttendanceRecordOperationalRow) {
  return {
    sessionId: row.session_id,
    learnerUserId: row.student_id,
    learner: {
      id: row.student_id,
      name: row.learner_name,
      email: row.learner_email,
      firstName: row.learner_first_name,
      lastName: row.learner_last_name,
      publicStudentId: row.public_student_id,
    },
    status: row.status,
    markedAt: row.marked_at,
    markedByUserId: row.marked_by,
    markedBy: row.marked_by
      ? {
          id: row.marked_by,
          name: row.marker_name,
          email: row.marker_email,
          firstName: row.marker_first_name,
          lastName: row.marker_last_name,
        }
      : null,
    checkedInAt: row.checked_in_at,
    statusReason: row.status_reason,
    attendanceSource: row.attendance_source,
    updatedAt: row.updated_at,
  };
}

export const attendanceRouter = Router();

// Create module/faculty records for attendance setup.
attendanceRouter.post(
  "/attendance/modules",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    const name = String(req.body?.name ?? "").trim();
    const courseId = String(req.body?.courseId ?? "").trim();
    const facultyIdRaw = String(req.body?.facultyId ?? "").trim();
    const facultyName = String(req.body?.facultyName ?? "").trim();

    if (!code) return err(res, 400, "VALIDATION", "code is required");
    if (!name) return err(res, 400, "VALIDATION", "name is required");
    if (!isUuid(courseId)) return err(res, 400, "VALIDATION", "courseId must be a UUID");

    const courseRes = await pool.query(`SELECT 1 FROM courses WHERE id = $1 LIMIT 1`, [courseId]);
    if ((courseRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Course not found");

    if (user.role === "LECTURER") {
      const allowed = await canLecturerManageCourse(user.id, courseId);
      if (!allowed) {
        return err(res, 403, "FORBIDDEN", "Lecturer can only create modules for assigned courses");
      }
    }

    let facultyId = facultyIdRaw;
    if (facultyId) {
      if (!isUuid(facultyId)) return err(res, 400, "VALIDATION", "facultyId must be a UUID");
      const f = await pool.query(`SELECT 1 FROM faculties WHERE id = $1 LIMIT 1`, [facultyId]);
      if ((f.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Faculty not found");
    } else {
      if (!facultyName) {
        return err(res, 400, "VALIDATION", "facultyName is required when facultyId is not provided");
      }
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM faculties WHERE lower(name) = lower($1) LIMIT 1`,
        [facultyName]
      );
      if ((existing.rowCount ?? 0) > 0) {
        facultyId = existing.rows[0].id;
      } else {
        const createdFaculty = await pool.query<{ id: string }>(
          `INSERT INTO faculties (name) VALUES ($1) RETURNING id`,
          [facultyName]
        );
        facultyId = createdFaculty.rows[0].id;
      }
    }

    const created = await pool.query<{
      id: string;
      faculty_id: string;
      course_id: string;
      code: string;
      name: string;
    }>(
      `
        INSERT INTO faculty_modules (faculty_id, course_id, code, name)
        VALUES ($1, $2, $3, $4)
        RETURNING id, faculty_id, course_id, code, name
      `,
      [facultyId, courseId, code, name]
    );

    return res.status(201).json({
      id: created.rows[0].id,
      facultyId: created.rows[0].faculty_id,
      courseId: created.rows[0].course_id,
      code: created.rows[0].code,
      name: created.rows[0].name,
    });
  } catch (e: any) {
    if (String(e?.code ?? "") === "23505") {
      return err(
        res,
        400,
        "VALIDATION",
        "Module code already exists. Courses can have multiple modules, but each module needs its own unique code."
      );
    }
    console.error("[attendance] POST /attendance/modules error", e);
    return err(res, 500, "INTERNAL", "Failed to create module");
  }
  }
);

// Assign lecturer to module.
attendanceRouter.post(
  "/attendance/modules/:moduleId/lecturers",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;
    const moduleId = String(req.params.moduleId ?? "").trim();
    const lecturerId = String(req.body?.lecturerId ?? "").trim();

    if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");
    if (!isUuid(lecturerId)) return err(res, 400, "VALIDATION", "lecturerId must be a UUID");

    const moduleRes = await pool.query<{ course_id: string }>(
      `
        SELECT course_id
        FROM faculty_modules
        WHERE id = $1
        LIMIT 1
      `,
      [moduleId]
    );
    if ((moduleRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Module not found");

    if (user.role === "LECTURER") {
      const allowed = await canLecturerManageModule(user.id, moduleId);
      if (!allowed) {
        return err(res, 403, "FORBIDDEN", "Lecturer can only create sessions for assigned modules");
      }
    }

    if (user.role === "LECTURER") {
      const allowed = await canLecturerManageModule(user.id, moduleId);
      if (!allowed) {
        return err(res, 403, "FORBIDDEN", "Lecturer can only manage assigned modules");
      }
    }

    const lecturer = await pool.query(
      `
        SELECT 1
        FROM users
        WHERE id = $1
          AND role = 'LECTURER'
        LIMIT 1
      `,
      [lecturerId]
    );
    if ((lecturer.rowCount ?? 0) === 0) {
      return err(res, 404, "NOT_FOUND", "Lecturer not found");
    }

    const inserted = await pool.query(
      `
        INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, lecturer_id) DO NOTHING
      `,
      [moduleId, lecturerId]
    );

    return res.status(200).json({ ok: true, created: (inserted.rowCount ?? 0) > 0 });
  } catch (e) {
    console.error("[attendance] POST /attendance/modules/:moduleId/lecturers error", e);
    return err(res, 500, "INTERNAL", "Failed to assign lecturer");
  }
  }
);

// Enroll student to module and expose auto-linked lecturers for attendance/messaging workflows.
attendanceRouter.post(
  "/attendance/modules/:moduleId/enrollments",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;
    const moduleId = String(req.params.moduleId ?? "").trim();
    const studentId = String(req.body?.studentId ?? "").trim();

    if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");
    if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

    const moduleRes = await pool.query<{ course_id: string }>(
      `
        SELECT course_id
        FROM faculty_modules
        WHERE id = $1
        LIMIT 1
      `,
      [moduleId]
    );
    if ((moduleRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Module not found");

    if (user.role === "LECTURER") {
      const allowed = await canLecturerManageModule(user.id, moduleId);
      if (!allowed) {
        return err(res, 403, "FORBIDDEN", "Lecturer can only manage assigned modules");
      }
    }

    const student = await pool.query(
      `
        SELECT 1
        FROM users
        WHERE id = $1
          AND role = 'STUDENT'
        LIMIT 1
      `,
      [studentId]
    );
    if ((student.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Student not found");

    const activeInCourse = await isStudentActiveInCourse(
      pool,
      studentId,
      moduleRes.rows[0].course_id
    );
    if (!activeInCourse) {
      return err(res, 400, "VALIDATION", "Student must be enrolled in the module's course first");
    }

    const inserted = await pool.query(
      `
        INSERT INTO student_module_enrollments (module_id, student_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, student_id) DO NOTHING
      `,
      [moduleId, studentId]
    );

    const lecturers = await pool.query<{ id: string; email: string }>(
      `
        SELECT u.id, u.email
        FROM lecturer_module_assignments lma
        JOIN users u ON u.id = lma.lecturer_id
        WHERE lma.module_id = $1
        ORDER BY lower(u.email) ASC
      `,
      [moduleId]
    );

    return res.status(200).json({
      ok: true,
      created: (inserted.rowCount ?? 0) > 0,
      linkedLecturers: lecturers.rows,
    });
  } catch (e) {
    console.error("[attendance] POST /attendance/modules/:moduleId/enrollments error", e);
    return err(res, 500, "INTERNAL", "Failed to enroll student");
  }
  }
);

attendanceRouter.delete(
  "/attendance/modules/:moduleId/enrollments/:studentId",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const user = req.user!;
      const moduleId = String(req.params.moduleId ?? "").trim();
      const studentId = String(req.params.studentId ?? "").trim();

      if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");
      if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

      const moduleRes = await pool.query(`SELECT 1 FROM faculty_modules WHERE id = $1 LIMIT 1`, [moduleId]);
      if ((moduleRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Module not found");

      if (user.role === "LECTURER") {
        const allowed = await canLecturerManageModule(user.id, moduleId);
        if (!allowed) {
          return err(res, 403, "FORBIDDEN", "Lecturer can only manage assigned modules");
        }
      }

      const deleted = await pool.query(
        `
          DELETE FROM student_module_enrollments
          WHERE module_id = $1
            AND student_id = $2
        `,
        [moduleId, studentId]
      );

      if ((deleted.rowCount ?? 0) === 0) {
        return err(res, 404, "NOT_FOUND", "Student enrollment not found");
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error("[attendance] DELETE /attendance/modules/:moduleId/enrollments/:studentId error", e);
      return err(res, 500, "INTERNAL", "Failed to remove student enrollment");
    }
  }
);

attendanceRouter.delete(
  "/attendance/modules/:moduleId/lecturers/:lecturerId",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const user = req.user!;
      const moduleId = String(req.params.moduleId ?? "").trim();
      const lecturerId = String(req.params.lecturerId ?? "").trim();

      if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");
      if (!isUuid(lecturerId)) return err(res, 400, "VALIDATION", "lecturerId must be a UUID");

      if (user.role === "LECTURER") {
        const allowed = await canLecturerManageModule(user.id, moduleId);
        if (!allowed) {
          return err(res, 403, "FORBIDDEN", "Lecturer can only manage assigned modules");
        }
      }

      const deleted = await pool.query(
        `
          DELETE FROM lecturer_module_assignments
          WHERE module_id = $1
            AND lecturer_id = $2
        `,
        [moduleId, lecturerId]
      );

      if ((deleted.rowCount ?? 0) === 0) {
        return err(res, 404, "NOT_FOUND", "Lecturer assignment not found");
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error("[attendance] DELETE /attendance/modules/:moduleId/lecturers/:lecturerId error", e);
      return err(res, 500, "INTERNAL", "Failed to remove lecturer assignment");
    }
  }
);

// List modules available for attendance workflows.
attendanceRouter.get(
  "/attendance/modules",
  requireAccess({ roles: ["LECTURER", "ADMIN", "STUDENT"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;
    const isStudent = user.role === "STUDENT";
    const isLecturer = user.role === "LECTURER";

    const params: unknown[] = [];
    const where: string[] = [];
    if (isStudent) {
      params.push(user.id);
      where.push(`EXISTS (
        SELECT 1
        FROM student_module_enrollments sme2
        JOIN student_courses sc2
          ON sc2.student_user_id = sme2.student_id
         AND sc2.course_id = fm.course_id
         AND sc2.status = 'ACTIVE'
        WHERE sme2.module_id = fm.id
          AND sme2.student_id = $${params.length}
      )`);
    }

    if (isLecturer) {
      params.push(user.id);
      where.push(`EXISTS (
        SELECT 1
        FROM lecturer_module_assignments lma2
        WHERE lma2.module_id = fm.id
          AND lma2.lecturer_id = $${params.length}
      )`);
    }

    const sql = `
      SELECT
        fm.id,
        fm.course_id,
        fm.code,
        fm.name,
        c.code AS course_code,
        c.name AS course_name,
        f.name AS faculty_name,
        COUNT(DISTINCT sc_count.student_user_id)::int AS enrolled_count,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', lu.id,
              'email', lu.email
            )
          ) FILTER (WHERE lu.id IS NOT NULL),
          '[]'::json
        ) AS lecturers
      FROM faculty_modules fm
      JOIN faculties f ON f.id = fm.faculty_id
      JOIN courses c ON c.id = fm.course_id
      LEFT JOIN student_module_enrollments sme ON sme.module_id = fm.id
      LEFT JOIN student_courses sc_count
        ON sc_count.student_user_id = sme.student_id
       AND sc_count.course_id = fm.course_id
       AND sc_count.status = 'ACTIVE'
      LEFT JOIN lecturer_module_assignments lma ON lma.module_id = fm.id
      LEFT JOIN users lu ON lu.id = lma.lecturer_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      GROUP BY fm.id, fm.course_id, fm.code, fm.name, c.code, c.name, f.name
      ORDER BY f.name ASC, fm.code ASC
    `;

    const rows = await pool.query<{
      id: string;
      course_id: string;
      code: string;
      name: string;
      course_code: string;
      course_name: string;
      faculty_name: string;
      enrolled_count: number;
      lecturers: unknown;
    }>(sql, params);

    const value = rows.rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      code: row.code,
      name: row.name,
      courseCode: row.course_code,
      courseName: row.course_name,
      facultyName: row.faculty_name,
      enrolledCount: Number(row.enrolled_count ?? 0),
      lecturers: Array.isArray(row.lecturers) ? row.lecturers : [],
    }));

    return res.json({ value, count: value.length });
  } catch (e) {
    console.error("[attendance] GET /attendance/modules error", e);
    return err(res, 500, "INTERNAL", "Failed to list modules");
  }
  }
);

// List students enrolled in one module.
attendanceRouter.get(
  "/attendance/modules/:moduleId/students",
  requireAccess({ roles: ["LECTURER", "ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;
    const moduleId = String(req.params.moduleId ?? "").trim();
    if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");

    const moduleRes = await pool.query(`SELECT 1 FROM faculty_modules WHERE id = $1 LIMIT 1`, [moduleId]);
    if ((moduleRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Module not found");

    if (user.role === "LECTURER") {
      const allowed = await canLecturerManageModule(user.id, moduleId);
      if (!allowed) {
        return err(res, 403, "FORBIDDEN", "Lecturer can only view assigned module rosters");
      }
    }

    const rows = await pool.query<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      course_name: string | null;
      public_student_id: string | null;
    }>(
      `
        SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          c.name AS course_name,
          u.public_student_id
        FROM faculty_modules fm
        JOIN courses c ON c.id = fm.course_id
        JOIN student_module_enrollments sme
          ON sme.module_id = fm.id
        JOIN student_courses sc
          ON sc.student_user_id = sme.student_id
         AND sc.course_id = fm.course_id
         AND sc.status = 'ACTIVE'
        JOIN users u ON u.id = sme.student_id
        WHERE fm.id = $1
        ORDER BY lower(u.email) ASC
      `,
      [moduleId]
    );

    const value = rows.rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      courseName: r.course_name,
      studentNumber: r.public_student_id,
    }));

    return res.json({ value, count: value.length });
  } catch (e) {
    console.error("[attendance] GET /attendance/modules/:moduleId/students error", e);
    return err(res, 500, "INTERNAL", "Failed to list module students");
  }
  }
);

// Create session.
attendanceRouter.post(
  "/attendance/sessions",
  requireAccess({ roles: ["LECTURER", "ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;

    const calendarEntryId = String(req.body?.calendarEntryId ?? req.body?.calendar_entry_id ?? "").trim();
    if (calendarEntryId && !isUuid(calendarEntryId)) {
      return err(res, 400, "VALIDATION", "calendarEntryId must be a UUID");
    }

    const calendarSource = calendarEntryId
      ? await loadCalendarAttendanceSource(calendarEntryId)
      : null;
    if (calendarEntryId && !calendarSource) {
      return err(res, 404, "NOT_FOUND", "Course-linked calendar entry not found");
    }
    if (calendarSource && !calendarSource.module_id) {
      return err(
        res,
        400,
        "VALIDATION",
        "Attendance sessions require a module-linked calendar entry"
      );
    }

    const moduleId = calendarSource?.module_id ?? String(req.body?.moduleId ?? "").trim();
    if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");

    const startsAtFromBody = parseOptionalDateTime(req.body?.startsAt);
    const endsAtFromBody = parseOptionalDateTime(req.body?.endsAt);
    if (startsAtFromBody === undefined) {
      return err(res, 400, "VALIDATION", "startsAt must be a valid ISO date/time");
    }
    if (endsAtFromBody === undefined) {
      return err(res, 400, "VALIDATION", "endsAt must be a valid ISO date/time");
    }

    const startsAt = calendarSource?.starts_at ?? startsAtFromBody;
    const endsAt = calendarSource?.ends_at ?? endsAtFromBody;
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      return err(res, 400, "VALIDATION", "endsAt must be after startsAt");
    }

    const date =
      parseDateOnly(req.body?.date) ??
      (startsAt ? new Date(startsAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    const attendanceOpenParsed = parseOptionalDateTime(
      req.body?.attendanceOpenAt ?? req.body?.attendance_open_at
    );
    const attendanceCloseParsed = parseOptionalDateTime(
      req.body?.attendanceCloseAt ?? req.body?.attendance_close_at
    );
    if (attendanceOpenParsed === undefined) {
      return err(res, 400, "VALIDATION", "attendanceOpenAt must be a valid ISO date/time");
    }
    if (attendanceCloseParsed === undefined) {
      return err(res, 400, "VALIDATION", "attendanceCloseAt must be a valid ISO date/time");
    }
    const attendanceOpenAt = attendanceOpenParsed ?? startsAt;
    const attendanceCloseAt = attendanceCloseParsed ?? endsAt;
    const latenessThresholdMinutes = parseLatenessThresholdMinutes(
      req.body?.latenessThresholdMinutes ?? req.body?.lateness_threshold_minutes
    );
    if (latenessThresholdMinutes === null) {
      return err(
        res,
        400,
        "VALIDATION",
        "latenessThresholdMinutes must be between 0 and 1440 minutes"
      );
    }

    const moduleRes = await pool.query<{ id: string; code: string; name: string; course_id: string }>(
      `
        SELECT id, code, name, course_id
        FROM faculty_modules
        WHERE id = $1
        LIMIT 1
      `,
      [moduleId]
    );
    if ((moduleRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Module not found");
    const courseId = calendarSource?.course_id ?? moduleRes.rows[0].course_id;
    if (calendarSource && moduleRes.rows[0].course_id !== calendarSource.course_id) {
      return err(res, 400, "VALIDATION", "Calendar entry module does not belong to its course");
    }

    const sessionOwnerId = user.id;
    if (user.role === "LECTURER") {
      const assigned = await isLecturerAssignedToModule(pool, sessionOwnerId, moduleId);
      if (!assigned) {
        await pool.query(
          `
            INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
            VALUES ($1, $2)
            ON CONFLICT (module_id, lecturer_id) DO NOTHING
          `,
          [moduleId, sessionOwnerId]
        );
      }
    }

    if (calendarSource) {
      const existing = await pool.query<AttendanceSessionRow>(
        `
          SELECT
            id,
            lecturer_id,
            module_id,
            course_id,
            calendar_entry_id,
            course_schedule_template_id,
            attendance_date,
            starts_at::text AS starts_at,
            ends_at::text AS ends_at,
            attendance_open_at::text AS attendance_open_at,
            attendance_close_at::text AS attendance_close_at,
            lateness_threshold_minutes,
            session_source,
            finalized_at::text AS finalized_at,
            created_at::text AS created_at
          FROM attendance_sessions
          WHERE (
              $1::uuid IS NOT NULL
              AND course_schedule_template_id = $1::uuid
            )
            OR (
              $1::uuid IS NULL
              AND calendar_entry_id = $2::uuid
            )
          LIMIT 1
        `,
        [calendarSource.course_schedule_template_id, calendarSource.id]
      );
      const existingRow = existing.rows[0];
      if (existingRow) {
        const seededCount = await seedPendingAttendanceRecords(pool, {
          sessionId: existingRow.id,
          moduleId: existingRow.module_id,
        });
        const reminderEventCount = await createPreSessionReminderEventsForSession(pool, {
          sessionId: existingRow.id,
        });
        return res.json({
          ok: true,
          session: mapAttendanceSession(existingRow, false),
          seededCount,
          reminderEventCount,
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const created = await client.query<AttendanceSessionRow>(
      `
        INSERT INTO attendance_sessions (
          lecturer_id,
          module_id,
          course_id,
          calendar_entry_id,
          course_schedule_template_id,
          attendance_date,
          starts_at,
          ends_at,
          attendance_open_at,
          attendance_close_at,
          lateness_threshold_minutes,
          session_source,
          created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::date,
          $7::timestamptz,
          $8::timestamptz,
          $9::timestamptz,
          $10::timestamptz,
          $11,
          $12,
          $13
        )
        RETURNING
          id,
          lecturer_id,
          module_id,
          course_id,
          calendar_entry_id,
          course_schedule_template_id,
          attendance_date::text AS attendance_date,
          starts_at::text AS starts_at,
          ends_at::text AS ends_at,
          attendance_open_at::text AS attendance_open_at,
          attendance_close_at::text AS attendance_close_at,
          lateness_threshold_minutes,
          session_source,
          finalized_at::text AS finalized_at,
          created_at::text AS created_at
      `,
        [
          sessionOwnerId,
          moduleId,
          courseId,
          calendarSource?.id ?? null,
          calendarSource?.course_schedule_template_id ?? null,
          date,
          startsAt,
          endsAt,
          attendanceOpenAt,
          attendanceCloseAt,
          latenessThresholdMinutes,
          calendarSource ? "CALENDAR_EVENT" : "MANUAL",
          user.id,
        ]
      );

      const row = created.rows[0];
      const seededCount = calendarSource
        ? await seedPendingAttendanceRecords(client, {
            sessionId: row.id,
            moduleId: row.module_id,
          })
        : 0;
      const reminderEventCount = calendarSource
        ? await createPreSessionReminderEventsForSession(client, { sessionId: row.id })
        : 0;

      await client.query("COMMIT");
      return res.status(201).json({
        ok: true,
        ...mapAttendanceSession(row, true),
        session: mapAttendanceSession(row, true),
        seededCount,
        reminderEventCount,
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[attendance] POST /attendance/sessions error", e);
    return err(res, 500, "INTERNAL", "Failed to create attendance session");
  }
  }
);

// List sessions.
attendanceRouter.get(
  "/attendance/sessions",
  requireAccess({ roles: ["LECTURER", "ADMIN", "STUDENT"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;
    const moduleIdRaw = String(req.query.moduleId ?? "").trim();
    const courseIdRaw = String(req.query.courseId ?? "").trim();
    const calendarEntryIdRaw = String(req.query.calendarEntryId ?? "").trim();
    const createdByRaw = String(req.query.createdBy ?? req.query.lecturerId ?? "").trim();
    const dateRaw = String(req.query.date ?? "").trim();
    const fromRaw = String(req.query.from ?? "").trim();
    const toRaw = String(req.query.to ?? "").trim();
    const finalizedRaw = parseBoolean(req.query.finalized ?? req.query.isFinalized);
    const sessionStatusRaw = String(req.query.sessionStatus ?? "").trim().toUpperCase();
    const limit = parseOptionalNonNegativeInt(req.query.limit, 200);
    const offset = parseOptionalNonNegativeInt(req.query.offset, 100000);

    if (finalizedRaw === null) {
      return err(res, 400, "VALIDATION", "finalized must be true or false");
    }
    if (limit === null) {
      return err(res, 400, "VALIDATION", "limit must be an integer between 0 and 200");
    }
    if (offset === null) {
      return err(res, 400, "VALIDATION", "offset must be a non-negative integer");
    }
    if (sessionStatusRaw && !["OPEN", "FINALIZED"].includes(sessionStatusRaw)) {
      return err(res, 400, "VALIDATION", "sessionStatus must be OPEN or FINALIZED");
    }

    const params: unknown[] = [];
    const where: string[] = [];
    const currentStudentId = user.role === "STUDENT" ? user.id : null;

    params.push(currentStudentId);
    const studentLookupParam = params.length;

    if (user.role === "STUDENT") {
      params.push(user.id);
      where.push(`EXISTS (
        SELECT 1
        FROM student_module_enrollments sme
        JOIN student_courses sc
          ON sc.student_user_id = sme.student_id
         AND sc.course_id = fm.course_id
         AND sc.status = 'ACTIVE'
        WHERE sme.module_id = s.module_id
          AND sme.student_id = $${params.length}
      )`);
    }

    if (user.role === "LECTURER") {
      params.push(user.id);
      where.push(`EXISTS (
        SELECT 1
        FROM lecturer_module_assignments lma
        WHERE lma.module_id = s.module_id
          AND lma.lecturer_id = $${params.length}
      )`);
    }

    if (moduleIdRaw) {
      if (!isUuid(moduleIdRaw)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");
      if (user.role === "STUDENT") {
        const enrolled = await isStudentEnrolledInModule(user.id, moduleIdRaw);
        if (!enrolled) return err(res, 403, "FORBIDDEN", "Student is not enrolled in this module");
      }
      params.push(moduleIdRaw);
      where.push(`s.module_id = $${params.length}`);
    }

    if (courseIdRaw) {
      if (!isUuid(courseIdRaw)) return err(res, 400, "VALIDATION", "courseId must be a UUID");
      params.push(courseIdRaw);
      where.push(`COALESCE(s.course_id, fm.course_id) = $${params.length}`);
    }

    if (calendarEntryIdRaw) {
      if (!isUuid(calendarEntryIdRaw)) {
        return err(res, 400, "VALIDATION", "calendarEntryId must be a UUID");
      }
      params.push(calendarEntryIdRaw);
      where.push(`s.calendar_entry_id = $${params.length}`);
    }

    if (createdByRaw) {
      if (!isUuid(createdByRaw)) return err(res, 400, "VALIDATION", "createdBy must be a UUID");
      params.push(createdByRaw);
      where.push(`s.created_by = $${params.length}`);
    }

    if (dateRaw) {
      const date = parseDateOnly(dateRaw);
      if (!date) return err(res, 400, "VALIDATION", "date must be YYYY-MM-DD");
      params.push(date);
      where.push(`s.attendance_date = $${params.length}::date`);
    }

    if (fromRaw) {
      const from = parseDateOnly(fromRaw);
      if (!from) return err(res, 400, "VALIDATION", "from must be YYYY-MM-DD");
      params.push(from);
      where.push(`s.attendance_date >= $${params.length}::date`);
    }

    if (toRaw) {
      const to = parseDateOnly(toRaw);
      if (!to) return err(res, 400, "VALIDATION", "to must be YYYY-MM-DD");
      params.push(to);
      where.push(`s.attendance_date <= $${params.length}::date`);
    }

    if (fromRaw && toRaw) {
      const from = parseDateOnly(fromRaw);
      const to = parseDateOnly(toRaw);
      if (from && to && compareDateOnly(from, to) > 0) {
        return err(res, 400, "VALIDATION", "from cannot be after to");
      }
    }

    if (finalizedRaw !== undefined) {
      where.push(finalizedRaw ? "s.finalized_at IS NOT NULL" : "s.finalized_at IS NULL");
    }

    if (sessionStatusRaw) {
      where.push(sessionStatusRaw === "FINALIZED" ? "s.finalized_at IS NOT NULL" : "s.finalized_at IS NULL");
    }

    let limitClause = "";
    if (limit !== undefined) {
      params.push(limit);
      limitClause = `LIMIT $${params.length}`;
    }

    let offsetClause = "";
    if (offset !== undefined) {
      params.push(offset);
      offsetClause = `OFFSET $${params.length}`;
    }

    const rows = await pool.query<AttendanceSessionOperationalRow>(
      `
        SELECT
          s.id,
          s.lecturer_id,
          lecturer.email AS lecturer_email,
          lecturer.first_name AS lecturer_first_name,
          lecturer.last_name AS lecturer_last_name,
          s.module_id,
          fm.code AS module_code,
          fm.name AS module_name,
          f.name AS faculty_name,
          COALESCE(s.course_id, fm.course_id) AS course_id,
          c.name AS course_name,
          s.calendar_entry_id,
          s.course_schedule_template_id,
          s.attendance_date::text AS attendance_date,
          s.starts_at::text AS starts_at,
          s.ends_at::text AS ends_at,
          s.attendance_open_at::text AS attendance_open_at,
          s.attendance_close_at::text AS attendance_close_at,
          s.lateness_threshold_minutes,
          s.session_source,
          s.finalized_at::text AS finalized_at,
          s.finalized_by,
          s.created_by,
          s.created_at::text AS created_at,
          s.updated_at::text AS updated_at,
          my_checkin.checked_in_at,
          COALESCE(checkin_counts.checked_in_count, 0) AS checked_in_count,
          summary.total_count,
          summary.present_count,
          summary.late_count,
          summary.absent_count,
          summary.pending_count,
          COUNT(*) OVER() AS filtered_count
        FROM attendance_sessions s
        JOIN faculty_modules fm ON fm.id = s.module_id
        LEFT JOIN faculties f ON f.id = fm.faculty_id
        LEFT JOIN courses c ON c.id = COALESCE(s.course_id, fm.course_id)
        LEFT JOIN users lecturer ON lecturer.id = s.lecturer_id
        LEFT JOIN LATERAL (
          SELECT ac.checked_in_at
          FROM attendance_checkins ac
          WHERE ac.session_id = s.id
            AND ac.student_id = $${studentLookupParam}::uuid
          LIMIT 1
        ) my_checkin ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS checked_in_count
          FROM attendance_checkins ac2
          WHERE ac2.session_id = s.id
        ) checkin_counts ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS total_count,
            COUNT(*) FILTER (WHERE ar.status = 'PRESENT')::int AS present_count,
            COUNT(*) FILTER (WHERE ar.status = 'LATE')::int AS late_count,
            COUNT(*) FILTER (WHERE ar.status = 'ABSENT')::int AS absent_count,
            COUNT(*) FILTER (WHERE ar.status = 'PENDING')::int AS pending_count
          FROM attendance_records ar
          WHERE ar.session_id = s.id
        ) summary ON TRUE
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY s.attendance_date DESC, s.created_at DESC
        ${limitClause}
        ${offsetClause}
      `,
      params
    );

    const includeOperationalSummary = user.role !== "STUDENT";
    const value = rows.rows.map((r) => {
      const mapped = mapOperationalSession(r);
      return includeOperationalSummary ? mapped : { ...mapped, summary: undefined };
    });

    return res.json({
      value,
      count: value.length,
      total: Number(rows.rows[0]?.filtered_count ?? value.length),
      limit: limit ?? null,
      offset: offset ?? 0,
    });
  } catch (e) {
    console.error("[attendance] GET /attendance/sessions error", e);
    return err(res, 500, "INTERNAL", "Failed to list attendance sessions");
  }
  }
);

attendanceRouter.get(
  "/attendance/sessions/:id",
  requireAccess({ roles: ["LECTURER", "ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const user = req.user!;
      const sessionId = String(req.params.id ?? "").trim();
      if (!isUuid(sessionId)) return err(res, 400, "VALIDATION", "session id must be a UUID");

      const session = await loadOperationalAttendanceSession(sessionId);
      if (!session) return err(res, 404, "NOT_FOUND", "Attendance session not found");

      const allowed = await canStaffAccessAttendanceSession(user, session);
      if (!allowed) {
        return err(res, 403, "FORBIDDEN", "User cannot access this attendance session");
      }

      return res.json({ session: mapOperationalSession(session) });
    } catch (e) {
      console.error("[attendance] GET /attendance/sessions/:id error", e);
      return err(res, 500, "INTERNAL", "Failed to load attendance session");
    }
  }
);

attendanceRouter.get(
  "/attendance/sessions/:id/records",
  requireAccess({ roles: ["LECTURER", "ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const user = req.user!;
      const sessionId = String(req.params.id ?? "").trim();
      if (!isUuid(sessionId)) return err(res, 400, "VALIDATION", "session id must be a UUID");

      const session = await loadOperationalAttendanceSession(sessionId);
      if (!session) return err(res, 404, "NOT_FOUND", "Attendance session not found");

      const allowed = await canStaffAccessAttendanceSession(user, session);
      if (!allowed) {
        return err(res, 403, "FORBIDDEN", "User cannot access this attendance session");
      }

      let status: AttendanceRecordStatus | null = null;
      const statusRaw = String(req.query.status ?? "").trim();
      if (statusRaw) {
        status = normalizeRecordStatus(statusRaw);
        if (!status) {
          return err(
            res,
            400,
            "VALIDATION",
            `status must be one of ${VALID_ATTENDANCE_RECORD_STATUSES.join(", ")}`
          );
        }
      }

      const q = String(req.query.q ?? "").trim();
      if (q.length > 100) {
        return err(res, 400, "VALIDATION", "q must be 100 characters or fewer");
      }

      const records = await loadSessionAttendanceRecords({ sessionId, status, q });

      return res.json({
        session: mapOperationalSession(session),
        value: records.map(mapOperationalAttendanceRecord),
        count: records.length,
      });
    } catch (e) {
      console.error("[attendance] GET /attendance/sessions/:id/records error", e);
      return err(res, 500, "INTERNAL", "Failed to list attendance records");
    }
  }
);

attendanceRouter.get(
  "/attendance/sessions/:id/export.csv",
  requireAccess({ roles: ["LECTURER", "ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const user = req.user!;
      const sessionId = String(req.params.id ?? "").trim();
      if (!isUuid(sessionId)) return err(res, 400, "VALIDATION", "session id must be a UUID");

      const session = await loadOperationalAttendanceSession(sessionId);
      if (!session) return err(res, 404, "NOT_FOUND", "Attendance session not found");

      const allowed = await canStaffAccessAttendanceSession(user, session);
      if (!allowed) {
        return err(res, 403, "FORBIDDEN", "User cannot export this attendance session");
      }

      const records = await loadSessionAttendanceRecords({ sessionId });
      const csv = buildSessionAttendanceCsv(session, records);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="attendance-session-${sessionId}.csv"`
      );
      return res.status(200).send(csv);
    } catch (e) {
      console.error("[attendance] GET /attendance/sessions/:id/export.csv error", e);
      return err(res, 500, "INTERNAL", "Failed to export attendance session");
    }
  }
);

attendanceRouter.get(
  "/attendance/sessions/:id/roster",
  requireAccess({ roles: ["LECTURER", "ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  try {
    const user = req.user!;
    const sessionId = String(req.params.id ?? "").trim();
    if (!isUuid(sessionId)) return err(res, 400, "VALIDATION", "session id must be a UUID");

    const session = await getAttendanceSessionContext(sessionId);
    if (!session) return err(res, 404, "NOT_FOUND", "Attendance session not found");

    if (user.role === "LECTURER") {
      const canAccess = await canLecturerManageModule(user.id, session.module_id);
      if (!canAccess) {
        return err(res, 403, "FORBIDDEN", "Lecturer cannot access this attendance session");
      }
    }

    const rows = await pool.query<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      course_name: string | null;
      public_student_id: string | null;
      checked_in_at: string | null;
      current_status: AttendanceRecordStatus | null;
      marked_at: string | null;
    }>(
      `
        SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          c.name AS course_name,
          u.public_student_id,
          ac.checked_in_at,
          ar.status AS current_status,
          ar.marked_at
        FROM faculty_modules fm
        JOIN courses c ON c.id = fm.course_id
        JOIN student_module_enrollments sme
          ON sme.module_id = fm.id
        JOIN student_courses sc
          ON sc.student_user_id = sme.student_id
         AND sc.course_id = fm.course_id
         AND sc.status = 'ACTIVE'
        JOIN users u ON u.id = sme.student_id
        LEFT JOIN attendance_checkins ac
          ON ac.session_id = $2
          AND ac.student_id = sme.student_id
        LEFT JOIN attendance_records ar
          ON ar.session_id = $2
          AND ar.student_id = sme.student_id
        WHERE fm.id = $1
        ORDER BY lower(u.email) ASC
      `,
      [session.module_id, sessionId]
    );

    const value = rows.rows.map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      courseName: row.course_name,
      studentNumber: row.public_student_id,
      checkedInAt: row.checked_in_at,
      currentStatus: row.current_status,
      markedAt: row.marked_at,
      suggestedStatus: inferSuggestedStatus(
        session.starts_at,
        row.checked_in_at,
        Number(session.lateness_threshold_minutes ?? 10)
      ),
    }));

    return res.json({
      session: {
        id: session.id,
        lecturerId: session.lecturer_id,
        moduleId: session.module_id,
        date: session.attendance_date,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        attendanceOpenAt: session.attendance_open_at,
        attendanceCloseAt: session.attendance_close_at,
        latenessThresholdMinutes: Number(session.lateness_threshold_minutes ?? 10),
        finalizedAt: session.finalized_at,
      },
      value,
      count: value.length,
    });
  } catch (e) {
    console.error("[attendance] GET /attendance/sessions/:id/roster error", e);
    return err(res, 500, "INTERNAL", "Failed to load attendance roster");
  }
  }
);

attendanceRouter.post("/attendance/sessions/:id/check-in", requireRole("STUDENT"), async (req, res) => {
  try {
    const user = req.user!;
    const sessionId = String(req.params.id ?? "").trim();
    if (!isUuid(sessionId)) return err(res, 400, "VALIDATION", "session id must be a UUID");

    const session = await getAttendanceSessionContext(sessionId);
    if (!session) return err(res, 404, "NOT_FOUND", "Attendance session not found");

    const enrolled = await isStudentEnrolledInModule(user.id, session.module_id);
    if (!enrolled) return err(res, 403, "FORBIDDEN", "Student is not enrolled in this module");

    const existingRecord = await pool.query<{ status: AttendanceRecordStatus }>(
      `
        SELECT status
        FROM attendance_records
        WHERE session_id = $1
          AND student_id = $2
        LIMIT 1
      `,
      [sessionId, user.id]
    );
    if (
      (existingRecord.rowCount ?? 0) > 0 &&
      existingRecord.rows[0]?.status !== "PENDING"
    ) {
      return err(res, 400, "VALIDATION", "Attendance is already marked for this session");
    }

    const inserted = await pool.query<{ checked_in_at: string }>(
      `
        INSERT INTO attendance_checkins (session_id, student_id)
        VALUES ($1, $2)
        ON CONFLICT (session_id, student_id) DO NOTHING
        RETURNING checked_in_at
      `,
      [sessionId, user.id]
    );

    let checkedInAt = inserted.rows[0]?.checked_in_at ?? null;
    if (!checkedInAt) {
      const existingCheckin = await pool.query<{ checked_in_at: string }>(
        `
          SELECT checked_in_at
          FROM attendance_checkins
          WHERE session_id = $1
            AND student_id = $2
          LIMIT 1
        `,
        [sessionId, user.id]
      );
      checkedInAt = existingCheckin.rows[0]?.checked_in_at ?? null;
    }

    return res.json({
      ok: true,
      created: (inserted.rowCount ?? 0) > 0,
      checkedInAt,
      suggestedStatus: inferSuggestedStatus(
        session.starts_at,
        checkedInAt,
        Number(session.lateness_threshold_minutes ?? 10)
      ),
    });
  } catch (e) {
    console.error("[attendance] POST /attendance/sessions/:id/check-in error", e);
    return err(res, 500, "INTERNAL", "Failed to record session check-in");
  }
});

// Mark attendance.
attendanceRouter.post(
  "/attendance/sessions/:id/mark",
  requireAccess({ roles: ["LECTURER", "ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
  const sessionId = String(req.params.id ?? "").trim();
  if (!isUuid(sessionId)) return err(res, 400, "VALIDATION", "session id must be a UUID");

  const marksRaw: AttendanceMarkInput[] = Array.isArray(req.body)
    ? req.body
    : Array.isArray(req.body?.marks)
      ? req.body.marks
      : [];
  if (marksRaw.length === 0) {
    return err(res, 400, "VALIDATION", "Body must be a non-empty array of { studentId, status }");
  }

  const marks: ParsedAttendanceMark[] = marksRaw
    .map((row: AttendanceMarkInput): ParsedAttendanceMark => ({
      studentId: String(row.studentId ?? "").trim(),
      status: normalizeStatus(row.status),
      markedAt: parseDateTime(row.markedAt ?? row.marked_at) ?? new Date().toISOString(),
      statusReason: String(
        row.statusReason ?? row.status_reason ?? ""
      ).trim(),
    }))
    .filter((row: ParsedAttendanceMark) => row.studentId);

  if (
    marks.length !== marksRaw.length ||
    marks.some((row: ParsedAttendanceMark, index: number) =>
      String(marksRaw[index]?.status ?? "").trim() && row.status === null
    )
  ) {
    return err(
      res,
      400,
      "VALIDATION",
      `Each row must include valid studentId UUID + status in [${VALID_ATTENDANCE_STATUSES.join(", ")}]`
    );
  }

  for (const m of marks) {
    if (!isUuid(m.studentId)) {
      return err(res, 400, "VALIDATION", "studentId must be a UUID");
    }
  }

  try {
    const user = req.user!;
    const session = await getAttendanceSessionContext(sessionId);
    if (!session) return err(res, 404, "NOT_FOUND", "Attendance session not found");
    if (session.finalized_at) {
      return err(res, 409, "CONFLICT", "Attendance session has already been finalized");
    }

    if (user.role === "LECTURER") {
      const allowed = await canLecturerManageModule(user.id, session.module_id);
      if (!allowed) {
        return err(res, 403, "FORBIDDEN", "Lecturer cannot mark attendance for this session");
      }
    }

    const studentIds = [...new Set(marks.map((m: ParsedAttendanceMark) => m.studentId))];
      const enrolledRes = await pool.query<{ student_id: string }>(
        `
          SELECT sme.student_id
          FROM faculty_modules fm
          JOIN student_module_enrollments sme
            ON sme.module_id = fm.id
          JOIN student_courses sc
            ON sc.student_user_id = sme.student_id
           AND sc.course_id = fm.course_id
           AND sc.status = 'ACTIVE'
          WHERE fm.id = $1
            AND sme.student_id = ANY($2::uuid[])
        `,
        [session.module_id, studentIds]
      );

    const enrolled = new Set(enrolledRes.rows.map((r) => r.student_id));
    const missing = studentIds.filter((id) => !enrolled.has(id));
    if (missing.length > 0) {
      return err(res, 400, "VALIDATION", "One or more students are not enrolled in this module");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const out: Array<{
        sessionId: string;
        studentId: string;
        status: AttendanceStatus;
        markedAt: string;
        markedBy: string;
      }> = [];

      for (const m of marks) {
        const upsert = await client.query<{
          session_id: string;
          student_id: string;
          status: AttendanceStatus;
          marked_at: string;
          marked_by: string;
        }>(
          `
            INSERT INTO attendance_records (
              session_id,
              student_id,
              status,
              marked_at,
              marked_by,
              status_reason,
              attendance_source,
              updated_at
            )
            VALUES ($1, $2, $3, $4::timestamptz, $5, $6, 'MANUAL', now())
            ON CONFLICT (session_id, student_id)
            DO UPDATE SET
              status = EXCLUDED.status,
              marked_by = EXCLUDED.marked_by,
              marked_at = EXCLUDED.marked_at,
              status_reason = EXCLUDED.status_reason,
              attendance_source = 'MANUAL',
              updated_at = now()
            RETURNING session_id, student_id, status, marked_at, marked_by
          `,
          [
            sessionId,
            m.studentId,
            m.status ?? inferTimedAttendanceStatus(session, m.markedAt),
            m.markedAt,
            user.id,
            m.statusReason || null,
          ]
        );
        const row = upsert.rows[0];
        out.push({
          sessionId: row.session_id,
          studentId: row.student_id,
          status: row.status,
          markedAt: row.marked_at,
          markedBy: row.marked_by,
        });
      }

      await client.query("COMMIT");
      await createAttendanceNotifications({
        sessionId,
        marks: out.map((row) => ({
          studentId: row.studentId,
          status: row.status,
        })),
      }).catch((e) => {
        console.error("[attendance] notification fan-out failed", e);
      });
      return res.json({ ok: true, count: out.length, value: out });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[attendance] POST /attendance/sessions/:id/mark error", e);
    return err(res, 500, "INTERNAL", "Failed to mark attendance");
  }
  }
);

attendanceRouter.post(
  "/attendance/sessions/:id/finalize",
  requireAccess({ roles: ["LECTURER", "ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    const sessionId = String(req.params.id ?? "").trim();
    if (!isUuid(sessionId)) return err(res, 400, "VALIDATION", "session id must be a UUID");

    try {
      const user = req.user!;
      const session = await getAttendanceSessionContext(sessionId);
      if (!session) return err(res, 404, "NOT_FOUND", "Attendance session not found");

      if (user.role === "LECTURER") {
        const allowed = await canLecturerManageModule(user.id, session.module_id);
        if (!allowed) {
          return err(res, 403, "FORBIDDEN", "Lecturer cannot finalize this attendance session");
        }
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await seedPendingAttendanceRecords(client, {
          sessionId,
          moduleId: session.module_id,
        });

        const absent = await client.query<{
          session_id: string;
          student_id: string;
          status: AttendanceStatus;
          marked_at: string;
          marked_by: string;
        }>(
          `
            UPDATE attendance_records
            SET
              status = 'ABSENT',
              marked_at = COALESCE(marked_at, now()),
              marked_by = COALESCE(marked_by, $2),
              status_reason = COALESCE(NULLIF(status_reason, ''), 'FINALIZED_UNMARKED'),
              attendance_source = 'FINALIZATION',
              updated_at = now()
            WHERE session_id = $1
              AND status = 'PENDING'
            RETURNING session_id, student_id, status, marked_at, marked_by
          `,
          [sessionId, user.id]
        );

        const absenceNotificationEventCount = await createAbsenceFollowUpEventsForSession(client, {
          sessionId,
          studentIds: absent.rows.map((row) => row.student_id),
        });

        await client.query(
          `
            UPDATE attendance_sessions
            SET
              finalized_at = COALESCE(finalized_at, now()),
              finalized_by = COALESCE(finalized_by, $2),
              updated_at = now()
            WHERE id = $1
          `,
          [sessionId, user.id]
        );

        const updatedSession = await loadAttendanceSessionRow(client, sessionId);
        await client.query("COMMIT");

        return res.json({
          ok: true,
          finalized: true,
          session: updatedSession ? mapAttendanceSession(updatedSession, false) : null,
          absentCount: absent.rowCount ?? 0,
          absenceNotificationEventCount,
          value: absent.rows.map((row) => ({
            sessionId: row.session_id,
            studentId: row.student_id,
            status: row.status,
            markedAt: row.marked_at,
            markedBy: row.marked_by,
          })),
        });
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error("[attendance] POST /attendance/sessions/:id/finalize error", e);
      return err(res, 500, "INTERNAL", "Failed to finalize attendance session");
    }
  }
);

attendanceRouter.post(
  "/attendance/sessions/:id/close",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    const sessionId = String(req.params.id ?? "").trim();
    if (!isUuid(sessionId)) return err(res, 400, "VALIDATION", "session id must be a UUID");

    try {
      const user = req.user!;
      const session = await getAttendanceSessionContext(sessionId);
      if (!session) return err(res, 404, "NOT_FOUND", "Attendance session not found");

      await pool.query(
        `
          UPDATE attendance_sessions
          SET
            finalized_at = COALESCE(finalized_at, now()),
            finalized_by = COALESCE(finalized_by, $2),
            updated_at = now()
          WHERE id = $1
        `,
        [sessionId, user.id]
      );

      const updatedSession = await loadOperationalAttendanceSession(sessionId);
      return res.json({
        ok: true,
        closed: true,
        session: updatedSession ? mapOperationalSession(updatedSession) : null,
      });
    } catch (e) {
      console.error("[attendance] POST /attendance/sessions/:id/close error", e);
      return err(res, 500, "INTERNAL", "Failed to close attendance session");
    }
  }
);

attendanceRouter.delete(
  "/attendance/sessions/:id",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    const sessionId = String(req.params.id ?? "").trim();
    if (!isUuid(sessionId)) return err(res, 400, "VALIDATION", "session id must be a UUID");

    try {
      const session = await getAttendanceSessionContext(sessionId);
      if (!session) return err(res, 404, "NOT_FOUND", "Attendance session not found");

      const usage = await pool.query<{ records_count: number; checkins_count: number }>(
        `
          SELECT
            (SELECT COUNT(*)::int FROM attendance_records WHERE session_id = $1) AS records_count,
            (SELECT COUNT(*)::int FROM attendance_checkins WHERE session_id = $1) AS checkins_count
        `,
        [sessionId]
      );

      const recordsCount = Number(usage.rows[0]?.records_count ?? 0);
      const checkinsCount = Number(usage.rows[0]?.checkins_count ?? 0);
      if (recordsCount > 0 || checkinsCount > 0) {
        return err(
          res,
          409,
          "CONFLICT",
          "Attendance session cannot be deleted because it already has attendance records or check-ins"
        );
      }

      const deleted = await pool.query(`DELETE FROM attendance_sessions WHERE id = $1`, [sessionId]);
      return res.json({ ok: true, deleted: (deleted.rowCount ?? 0) > 0 });
    } catch (e) {
      console.error("[attendance] DELETE /attendance/sessions/:id error", e);
      return err(res, 500, "INTERNAL", "Failed to delete attendance session");
    }
  }
);

attendanceRouter.get(
  "/attendance/export",
  requireAccess({ roles: ["ADMIN", "LECTURER", "STUDENT", "PARENT"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const user = req.user!;
      const from = parseDateOnly(req.query.from);
      const to = parseDateOnly(req.query.to);
      const moduleId = String(req.query.moduleId ?? "").trim();
      const studentIdQuery = String(req.query.studentId ?? "").trim();
      const childIdQuery = String(req.query.childId ?? "").trim();

      if (!from || !to) {
        return err(res, 400, "VALIDATION", "from and to are required in YYYY-MM-DD format");
      }
      if (compareDateOnly(from, to) > 0) {
        return err(res, 400, "VALIDATION", "from cannot be after to");
      }
      if (moduleId && !isUuid(moduleId)) {
        return err(res, 400, "VALIDATION", "moduleId must be a UUID");
      }
      if (studentIdQuery && !isUuid(studentIdQuery)) {
        return err(res, 400, "VALIDATION", "studentId must be a UUID");
      }

      let studentId: string | null = null;

      if (user.role === "STUDENT") {
        studentId = user.id;
        if (moduleId) {
          const allowed = await isStudentAllowedForModule(pool, user.id, moduleId);
          if (!allowed) {
            return err(res, 403, "FORBIDDEN", "Student is not enrolled in this module");
          }
        }
      }

      if (user.role === "PARENT") {
        if (childIdQuery) {
          if (!isUuid(childIdQuery)) return err(res, 400, "VALIDATION", "childId must be a UUID");
          const linked = await ensureParentCanAccessChild(user.id, childIdQuery);
          if (!linked) return err(res, 403, "FORBIDDEN", "Parent is not linked to this student");
          studentId = childIdQuery;
        } else {
          const first = await pool.query<{ student_user_id: string }>(
            `
              SELECT student_user_id
              FROM parent_links
              WHERE parent_user_id = $1
              ORDER BY created_at ASC
              LIMIT 2
            `,
            [user.id]
          );

          if ((first.rowCount ?? 0) === 0) {
            return err(res, 400, "VALIDATION", "No linked children found for parent");
          }
          if ((first.rowCount ?? 0) > 1) {
            return err(res, 400, "VALIDATION", "childId is required when multiple children are linked");
          }
          studentId = first.rows[0].student_user_id;
        }

        if (moduleId && studentId) {
          const allowed = await isStudentAllowedForModule(pool, studentId, moduleId);
          if (!allowed) {
            return err(res, 403, "FORBIDDEN", "Selected child is not enrolled in this module");
          }
        }
      }

      if (user.role === "LECTURER") {
        if (!moduleId) {
          return err(res, 400, "VALIDATION", "moduleId is required for lecturer attendance exports");
        }
        const allowed = await canLecturerManageModule(user.id, moduleId);
        if (!allowed) {
          return err(res, 403, "FORBIDDEN", "Lecturer can only export attendance for assigned modules");
        }
        studentId = studentIdQuery || null;
        if (studentId) {
          const enrolled = await isStudentAllowedForModule(pool, studentId, moduleId);
          if (!enrolled) {
            return err(res, 400, "VALIDATION", "Student is not enrolled in this module");
          }
        }
      }

      if (user.role === "ADMIN") {
        studentId = studentIdQuery || null;
      }

      const rows = await pool.query<{
        student_name: string;
        student_number: string | null;
        course_name: string | null;
        module_code: string;
        module_name: string;
        attendance_date: string;
        status: AttendanceStatus;
      }>(
        `
          SELECT
            COALESCE(NULLIF(trim(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), u.email) AS student_name,
            u.public_student_id AS student_number,
            c.name AS course_name,
            fm.code AS module_code,
            fm.name AS module_name,
            s.attendance_date,
            ar.status
          FROM attendance_records ar
          JOIN attendance_sessions s ON s.id = ar.session_id
          JOIN faculty_modules fm ON fm.id = s.module_id
          JOIN courses c ON c.id = fm.course_id
          JOIN users u ON u.id = ar.student_id
          WHERE s.attendance_date >= $1::date
            AND s.attendance_date <= $2::date
            AND ($3::uuid IS NULL OR s.module_id = $3::uuid)
            AND ($4::uuid IS NULL OR ar.student_id = $4::uuid)
            AND ar.status <> 'PENDING'
          ORDER BY s.attendance_date ASC, lower(u.email) ASC, fm.code ASC
        `,
        [from, to, moduleId || null, studentId]
      );

      const csv = buildAttendanceCsv(rows.rows);
      const dateStamp = new Date().toISOString().slice(0, 10);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="attendance-${dateStamp}.csv"`);
      return res.status(200).send(csv);
    } catch (e) {
      console.error("[attendance] GET /attendance/export error", e);
      return err(res, 500, "INTERNAL", "Failed to export attendance");
    }
  }
);

// Student attendance view (or parent linked-child view).
attendanceRouter.get("/attendance/me", requireRole("STUDENT", "PARENT"), async (req, res) => {
  try {
    const user = req.user!;
    const from = req.query.from ? parseDateOnly(req.query.from) : null;
    const to = req.query.to ? parseDateOnly(req.query.to) : null;
    if (req.query.from && !from) return err(res, 400, "VALIDATION", "from must be YYYY-MM-DD");
    if (req.query.to && !to) return err(res, 400, "VALIDATION", "to must be YYYY-MM-DD");

    let studentId = user.id;

    if (user.role === "PARENT") {
      const childIdRaw = String(req.query.childId ?? "").trim();
      if (childIdRaw) {
        if (!isUuid(childIdRaw)) return err(res, 400, "VALIDATION", "childId must be a UUID");
        const linked = await ensureParentCanAccessChild(user.id, childIdRaw);
        if (!linked) return err(res, 403, "FORBIDDEN", "Parent is not linked to this student");
        studentId = childIdRaw;
      } else {
        const first = await pool.query<{ student_user_id: string }>(
          `
            SELECT student_user_id
            FROM parent_links
            WHERE parent_user_id = $1
            ORDER BY created_at ASC
            LIMIT 2
          `,
          [user.id]
        );

        if ((first.rowCount ?? 0) === 0) {
          return err(res, 400, "VALIDATION", "No linked children found for parent");
        }
        if ((first.rowCount ?? 0) > 1) {
          return err(res, 400, "VALIDATION", "childId is required when multiple children are linked");
        }
        studentId = first.rows[0].student_user_id;
      }
    }

    const rows = await pool.query<{
      session_id: string;
      attendance_date: string;
      starts_at: string | null;
      ends_at: string | null;
      module_id: string;
      module_code: string;
      module_name: string;
      faculty_name: string;
      status: AttendanceStatus;
      marked_at: string;
      first_name: string | null;
      last_name: string | null;
      course_name: string | null;
      email: string;
      public_student_id: string | null;
    }>(
      `
        SELECT
          s.id AS session_id,
          s.attendance_date,
          s.starts_at,
          s.ends_at,
          fm.id AS module_id,
          fm.code AS module_code,
          fm.name AS module_name,
          f.name AS faculty_name,
          ar.status,
          ar.marked_at,
          u.first_name,
          u.last_name,
          c.name AS course_name,
          u.email,
          u.public_student_id
        FROM attendance_records ar
        JOIN attendance_sessions s ON s.id = ar.session_id
        JOIN faculty_modules fm ON fm.id = s.module_id
        JOIN courses c ON c.id = fm.course_id
        JOIN student_courses sc
          ON sc.student_user_id = ar.student_id
         AND sc.course_id = fm.course_id
         AND sc.status = 'ACTIVE'
        JOIN faculties f ON f.id = fm.faculty_id
        JOIN users u ON u.id = ar.student_id
        WHERE ar.student_id = $1
          AND ($2::date IS NULL OR s.attendance_date >= $2::date)
          AND ($3::date IS NULL OR s.attendance_date <= $3::date)
          AND ar.status <> 'PENDING'
        ORDER BY s.attendance_date DESC, ar.marked_at DESC
      `,
      [studentId, from, to]
    );

    const summary = {
      present: rows.rows.filter((r) => r.status === "PRESENT").length,
      absent: rows.rows.filter((r) => r.status === "ABSENT").length,
      late: rows.rows.filter((r) => r.status === "LATE").length,
      total: rows.rows.length,
    };

    const first = rows.rows[0];
    const student = first
      ? {
          id: studentId,
          email: first.email,
          firstName: first.first_name,
          lastName: first.last_name,
          courseName: first.course_name,
          studentNumber: first.public_student_id,
        }
      : { id: studentId };

    const value = rows.rows.map((r) => ({
      sessionId: r.session_id,
      date: r.attendance_date,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      moduleId: r.module_id,
      moduleCode: r.module_code,
      moduleName: r.module_name,
      facultyName: r.faculty_name,
      status: r.status,
      markedAt: r.marked_at,
    }));

    return res.json({ student, summary, value, count: value.length });
  } catch (e) {
    console.error("[attendance] GET /attendance/me error", e);
    return err(res, 500, "INTERNAL", "Failed to load attendance");
  }
});
