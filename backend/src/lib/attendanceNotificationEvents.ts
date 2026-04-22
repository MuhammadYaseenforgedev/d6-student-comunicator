import type { PoolClient } from "pg";
import { pool } from "../config/db";

type Queryable = Pick<PoolClient, "query"> | typeof pool;

type CreatedCountRow = {
  created_count: number;
};

export type AttendanceNotificationEventType =
  | "PRE_SESSION_REMINDER"
  | "SESSION_FINALIZED_ABSENT";

export type AttendanceNotificationEventRow = {
  id: string;
  user_id: string;
  notification_type: AttendanceNotificationEventType;
  related_calendar_entry_id: string | null;
  related_attendance_session_id: string | null;
  scheduled_for: string;
  status: "PENDING" | "PROCESSED" | "SKIPPED" | "CANCELLED";
  channel_hint: string | null;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function listDueAttendanceNotificationEvents(
  db: Queryable,
  input: {
    now?: string | null;
    notificationType?: AttendanceNotificationEventType | null;
    relatedAttendanceSessionId?: string | null;
    limit?: number;
  } = {}
): Promise<AttendanceNotificationEventRow[]> {
  const result = await db.query<AttendanceNotificationEventRow>(
    `
      SELECT
        id,
        user_id,
        notification_type,
        related_calendar_entry_id,
        related_attendance_session_id,
        scheduled_for::text AS scheduled_for,
        status,
        channel_hint,
        payload,
        processed_at::text AS processed_at,
        created_at::text AS created_at,
        updated_at::text AS updated_at
      FROM attendance_notification_events
      WHERE status = 'PENDING'
        AND scheduled_for <= COALESCE($1::timestamptz, now())
        AND ($2::text IS NULL OR notification_type = $2::text)
        AND ($3::uuid IS NULL OR related_attendance_session_id = $3::uuid)
      ORDER BY scheduled_for ASC, created_at ASC
      LIMIT $4
    `,
    [
      input.now ?? null,
      input.notificationType ?? null,
      input.relatedAttendanceSessionId ?? null,
      Math.max(1, Math.min(Math.floor(input.limit ?? 50), 200)),
    ]
  );

  return result.rows;
}

export async function createPreSessionReminderEventsForSession(
  db: Queryable,
  input: { sessionId: string }
): Promise<number> {
  const result = await db.query<CreatedCountRow>(
    `
      WITH session_ctx AS (
        SELECT
          s.id AS session_id,
          s.module_id,
          s.calendar_entry_id,
          s.course_schedule_template_id,
          COALESCE(s.course_id, fm.course_id) AS course_id,
          COALESCE(s.starts_at, ce.starts_at) AS session_starts_at,
          fm.code AS module_code,
          fm.name AS module_name,
          c.name AS course_name,
          cst.reminder_minutes_before AS template_reminder_minutes_before
        FROM attendance_sessions s
        JOIN faculty_modules fm ON fm.id = s.module_id
        LEFT JOIN courses c ON c.id = COALESCE(s.course_id, fm.course_id)
        LEFT JOIN calendar_entries ce ON ce.id = s.calendar_entry_id
        LEFT JOIN course_schedule_templates cst ON cst.id = s.course_schedule_template_id
        WHERE s.id = $1
        LIMIT 1
      ),
      roster AS (
        SELECT DISTINCT
          sme.student_id AS user_id,
          sc.session_id,
          sc.calendar_entry_id AS fallback_calendar_entry_id,
          sc.course_schedule_template_id,
          sc.course_id,
          sc.session_starts_at,
          sc.module_code,
          sc.module_name,
          sc.course_name,
          sc.template_reminder_minutes_before
        FROM session_ctx sc
        JOIN student_module_enrollments sme ON sme.module_id = sc.module_id
        JOIN student_courses active_course
          ON active_course.student_user_id = sme.student_id
         AND active_course.course_id = sc.course_id
         AND active_course.status = 'ACTIVE'
      ),
      reminder_source AS (
        SELECT
          roster.user_id,
          roster.session_id,
          COALESCE(learner_entry.id, roster.fallback_calendar_entry_id) AS calendar_entry_id,
          COALESCE(learner_entry.starts_at, roster.session_starts_at) AS starts_at,
          COALESCE(
            learner_entry.reminder_minutes_before,
            roster.template_reminder_minutes_before
          ) AS reminder_minutes_before,
          roster.module_code,
          roster.module_name,
          roster.course_name
        FROM roster
        LEFT JOIN calendar_entries learner_entry
          ON learner_entry.user_id = roster.user_id
         AND learner_entry.event_source = 'COURSE_SYNC'
         AND learner_entry.course_schedule_template_id = roster.course_schedule_template_id
      ),
      inserted AS (
        INSERT INTO attendance_notification_events (
          user_id,
          notification_type,
          related_calendar_entry_id,
          related_attendance_session_id,
          scheduled_for,
          status,
          channel_hint,
          payload,
          updated_at
        )
        SELECT
          reminder_source.user_id,
          'PRE_SESSION_REMINDER',
          reminder_source.calendar_entry_id,
          reminder_source.session_id,
          reminder_source.starts_at - make_interval(mins => reminder_source.reminder_minutes_before),
          'PENDING',
          'IN_APP',
          jsonb_build_object(
            'sessionId', reminder_source.session_id,
            'calendarEntryId', reminder_source.calendar_entry_id,
            'moduleCode', reminder_source.module_code,
            'moduleName', reminder_source.module_name,
            'courseName', reminder_source.course_name,
            'startsAt', reminder_source.starts_at,
            'reminderMinutesBefore', reminder_source.reminder_minutes_before,
            'reason', 'PRE_SESSION_REMINDER'
          ),
          now()
        FROM reminder_source
        WHERE reminder_source.starts_at IS NOT NULL
          AND reminder_source.reminder_minutes_before IS NOT NULL
        ON CONFLICT DO NOTHING
        RETURNING id
      )
      SELECT COUNT(*)::int AS created_count
      FROM inserted
    `,
    [input.sessionId]
  );

  return Number(result.rows[0]?.created_count ?? 0);
}

export async function createAbsenceFollowUpEventsForSession(
  db: Queryable,
  input: { sessionId: string; studentIds: string[]; scheduledFor?: string | null }
): Promise<number> {
  const uniqueStudentIds = [
    ...new Set(input.studentIds.map((id) => String(id).trim()).filter(Boolean)),
  ];
  if (uniqueStudentIds.length === 0) return 0;

  const result = await db.query<CreatedCountRow>(
    `
      WITH session_ctx AS (
        SELECT
          s.id AS session_id,
          s.calendar_entry_id,
          s.attendance_date,
          s.starts_at,
          s.ends_at,
          fm.code AS module_code,
          fm.name AS module_name,
          c.name AS course_name
        FROM attendance_sessions s
        JOIN faculty_modules fm ON fm.id = s.module_id
        LEFT JOIN courses c ON c.id = COALESCE(s.course_id, fm.course_id)
        WHERE s.id = $1
        LIMIT 1
      ),
      absent_records AS (
        SELECT
          ar.student_id AS user_id,
          ar.session_id,
          ar.status,
          ar.marked_at,
          ar.status_reason,
          sc.calendar_entry_id,
          sc.attendance_date,
          sc.starts_at,
          sc.ends_at,
          sc.module_code,
          sc.module_name,
          sc.course_name
        FROM attendance_records ar
        JOIN session_ctx sc ON sc.session_id = ar.session_id
        WHERE ar.session_id = $1
          AND ar.student_id = ANY($2::uuid[])
          AND ar.status = 'ABSENT'
      ),
      inserted AS (
        INSERT INTO attendance_notification_events (
          user_id,
          notification_type,
          related_calendar_entry_id,
          related_attendance_session_id,
          scheduled_for,
          status,
          channel_hint,
          payload,
          updated_at
        )
        SELECT
          absent_records.user_id,
          'SESSION_FINALIZED_ABSENT',
          absent_records.calendar_entry_id,
          absent_records.session_id,
          COALESCE($3::timestamptz, now()),
          'PENDING',
          'IN_APP',
          jsonb_build_object(
            'sessionId', absent_records.session_id,
            'calendarEntryId', absent_records.calendar_entry_id,
            'moduleCode', absent_records.module_code,
            'moduleName', absent_records.module_name,
            'courseName', absent_records.course_name,
            'attendanceDate', absent_records.attendance_date,
            'startsAt', absent_records.starts_at,
            'endsAt', absent_records.ends_at,
            'status', absent_records.status,
            'statusReason', absent_records.status_reason,
            'reason', 'SESSION_FINALIZED_ABSENT'
          ),
          now()
        FROM absent_records
        ON CONFLICT DO NOTHING
        RETURNING id
      )
      SELECT COUNT(*)::int AS created_count
      FROM inserted
    `,
    [input.sessionId, uniqueStudentIds, input.scheduledFor ?? null]
  );

  return Number(result.rows[0]?.created_count ?? 0);
}
