-- Attendance + profile + integrations scaffolding
-- Additive and safe to run once via schema_migrations flow.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- User profile enrichment
-- =========================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text,
ADD COLUMN IF NOT EXISTS course_name text;

-- =========================
-- Faculty / module mappings
-- =========================
CREATE TABLE IF NOT EXISTS faculties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS faculty_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faculty_modules_faculty_id
  ON faculty_modules(faculty_id);

CREATE TABLE IF NOT EXISTS lecturer_module_assignments (
  module_id uuid NOT NULL REFERENCES faculty_modules(id) ON DELETE CASCADE,
  lecturer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module_id, lecturer_id)
);

CREATE INDEX IF NOT EXISTS idx_lecturer_module_assignments_lecturer_id
  ON lecturer_module_assignments(lecturer_id);

CREATE TABLE IF NOT EXISTS student_module_enrollments (
  module_id uuid NOT NULL REFERENCES faculty_modules(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_module_enrollments_student_id
  ON student_module_enrollments(student_id);

-- =========================
-- Attendance
-- =========================
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lecturer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES faculty_modules(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_module_date
  ON attendance_sessions(module_id, attendance_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_lecturer_date
  ON attendance_sessions(lecturer_id, attendance_date DESC);

CREATE TABLE IF NOT EXISTS attendance_records (
  session_id uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE')),
  marked_at timestamptz NOT NULL DEFAULT now(),
  marked_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_student
  ON attendance_records(student_id, marked_at DESC);

-- =========================
-- Integrations scaffold
-- =========================
CREATE TABLE IF NOT EXISTS integration_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NULL,
  environment text NOT NULL DEFAULT 'default',
  provider text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_configs_global
  ON integration_configs(environment, provider)
  WHERE tenant_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_configs_tenant
  ON integration_configs(tenant_key, environment, provider)
  WHERE tenant_key IS NOT NULL;
