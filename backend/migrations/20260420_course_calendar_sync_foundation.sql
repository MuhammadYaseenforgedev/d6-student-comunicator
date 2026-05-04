CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS course_schedule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id uuid NULL REFERENCES faculty_modules(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NULL,
  location text NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  recurrence_rule text NULL,
  reminder_minutes_before integer NULL DEFAULT 15,
  external_provider text NULL,
  external_event_id text NULL,
  sync_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_schedule_templates_time_valid CHECK (ends_at > starts_at),
  CONSTRAINT course_schedule_templates_reminder_valid CHECK (
    reminder_minutes_before IS NULL
    OR (reminder_minutes_before >= 0 AND reminder_minutes_before <= 10080)
  )
);

CREATE INDEX IF NOT EXISTS idx_course_schedule_templates_course_active
  ON course_schedule_templates(course_id, is_active, starts_at);

ALTER TABLE calendar_entries
  ADD COLUMN IF NOT EXISTS module_id uuid NULL REFERENCES faculty_modules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS course_schedule_template_id uuid NULL REFERENCES course_schedule_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_source text NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN IF NOT EXISTS source_reference_id text NULL,
  ADD COLUMN IF NOT EXISTS reminder_minutes_before integer NULL,
  ADD COLUMN IF NOT EXISTS external_provider text NULL,
  ADD COLUMN IF NOT EXISTS external_event_id text NULL,
  ADD COLUMN IF NOT EXISTS sync_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE calendar_entries
  DROP CONSTRAINT IF EXISTS calendar_entries_event_source_valid;

ALTER TABLE calendar_entries
  ADD CONSTRAINT calendar_entries_event_source_valid
  CHECK (event_source IN ('INTERNAL', 'COURSE_SYNC', 'TEAMS_SYNC')) NOT VALID;

ALTER TABLE calendar_entries
  VALIDATE CONSTRAINT calendar_entries_event_source_valid;

ALTER TABLE calendar_entries
  DROP CONSTRAINT IF EXISTS calendar_entries_reminder_valid;

ALTER TABLE calendar_entries
  ADD CONSTRAINT calendar_entries_reminder_valid
  CHECK (
    reminder_minutes_before IS NULL
    OR (reminder_minutes_before >= 0 AND reminder_minutes_before <= 10080)
  ) NOT VALID;

ALTER TABLE calendar_entries
  VALIDATE CONSTRAINT calendar_entries_reminder_valid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_entries_course_sync_template_unique
  ON calendar_entries(user_id, course_schedule_template_id)
  WHERE event_source = 'COURSE_SYNC'
    AND course_schedule_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_entries_course_source
  ON calendar_entries(course_id, event_source, starts_at)
  WHERE course_id IS NOT NULL;
