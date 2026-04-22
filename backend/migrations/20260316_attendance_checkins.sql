CREATE TABLE IF NOT EXISTS attendance_checkins (
  session_id uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_checkins_student
  ON attendance_checkins(student_id, checked_in_at DESC);
