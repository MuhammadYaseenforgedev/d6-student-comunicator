ALTER TABLE attendance_sessions
  ADD COLUMN IF NOT EXISTS calendar_entry_id uuid NULL REFERENCES calendar_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS course_schedule_template_id uuid NULL REFERENCES course_schedule_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS course_id uuid NULL REFERENCES courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attendance_open_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS attendance_close_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS lateness_threshold_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS finalized_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_source text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE attendance_sessions s
SET course_id = fm.course_id
FROM faculty_modules fm
WHERE s.module_id = fm.id
  AND s.course_id IS NULL;

ALTER TABLE attendance_sessions
  DROP CONSTRAINT IF EXISTS attendance_sessions_lateness_threshold_valid;

ALTER TABLE attendance_sessions
  ADD CONSTRAINT attendance_sessions_lateness_threshold_valid
  CHECK (lateness_threshold_minutes >= 0 AND lateness_threshold_minutes <= 1440) NOT VALID;

ALTER TABLE attendance_sessions
  VALIDATE CONSTRAINT attendance_sessions_lateness_threshold_valid;

ALTER TABLE attendance_sessions
  DROP CONSTRAINT IF EXISTS attendance_sessions_source_valid;

ALTER TABLE attendance_sessions
  ADD CONSTRAINT attendance_sessions_source_valid
  CHECK (session_source IN ('MANUAL', 'CALENDAR_EVENT', 'AUTOMATION')) NOT VALID;

ALTER TABLE attendance_sessions
  VALIDATE CONSTRAINT attendance_sessions_source_valid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_sessions_calendar_entry_unique
  ON attendance_sessions(calendar_entry_id)
  WHERE calendar_entry_id IS NOT NULL
    AND course_schedule_template_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_sessions_schedule_template_unique
  ON attendance_sessions(course_schedule_template_id)
  WHERE course_schedule_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_course_date
  ON attendance_sessions(course_id, attendance_date DESC)
  WHERE course_id IS NOT NULL;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS status_reason text NULL,
  ADD COLUMN IF NOT EXISTS attendance_source text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE attendance_records
  ALTER COLUMN marked_at DROP NOT NULL;

ALTER TABLE attendance_records
  ALTER COLUMN marked_by DROP NOT NULL;

ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_status_check;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('PENDING', 'PRESENT', 'ABSENT', 'LATE')) NOT VALID;

ALTER TABLE attendance_records
  VALIDATE CONSTRAINT attendance_records_status_check;
