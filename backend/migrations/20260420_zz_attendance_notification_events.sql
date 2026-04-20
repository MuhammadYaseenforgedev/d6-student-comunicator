CREATE TABLE IF NOT EXISTS attendance_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  related_calendar_entry_id uuid NULL REFERENCES calendar_entries(id) ON DELETE SET NULL,
  related_attendance_session_id uuid NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  channel_hint text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attendance_notification_events
  DROP CONSTRAINT IF EXISTS attendance_notification_events_type_valid;

ALTER TABLE attendance_notification_events
  ADD CONSTRAINT attendance_notification_events_type_valid
  CHECK (notification_type IN ('PRE_SESSION_REMINDER', 'SESSION_FINALIZED_ABSENT')) NOT VALID;

ALTER TABLE attendance_notification_events
  VALIDATE CONSTRAINT attendance_notification_events_type_valid;

ALTER TABLE attendance_notification_events
  DROP CONSTRAINT IF EXISTS attendance_notification_events_status_valid;

ALTER TABLE attendance_notification_events
  ADD CONSTRAINT attendance_notification_events_status_valid
  CHECK (status IN ('PENDING', 'PROCESSED', 'SKIPPED', 'CANCELLED')) NOT VALID;

ALTER TABLE attendance_notification_events
  VALIDATE CONSTRAINT attendance_notification_events_status_valid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_notification_pre_session_unique
  ON attendance_notification_events (
    user_id,
    notification_type,
    related_attendance_session_id,
    scheduled_for
  )
  WHERE notification_type = 'PRE_SESSION_REMINDER';

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_notification_absent_unique
  ON attendance_notification_events (
    user_id,
    notification_type,
    related_attendance_session_id
  )
  WHERE notification_type = 'SESSION_FINALIZED_ABSENT';

CREATE INDEX IF NOT EXISTS idx_attendance_notification_due
  ON attendance_notification_events(status, scheduled_for)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_attendance_notification_session
  ON attendance_notification_events(related_attendance_session_id, notification_type);
