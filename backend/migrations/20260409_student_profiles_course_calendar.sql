CREATE TABLE IF NOT EXISTS student_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth date NULL,
  mobile_number text NULL,
  alternative_contact_number text NULL,
  street_address text NULL,
  city text NULL,
  province text NULL,
  postal_code text NULL,
  emergency_contact_name text NULL,
  emergency_contact_number text NULL,
  fee_status text NULL,
  payment_method text NULL,
  amount_due_cents integer NULL CHECK (amount_due_cents IS NULL OR amount_due_cents >= 0),
  amount_paid_cents integer NULL CHECK (amount_paid_cents IS NULL OR amount_paid_cents >= 0),
  last_payment_date date NULL,
  payment_reference text NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_profiles_fee_status_check
    CHECK (fee_status IS NULL OR fee_status IN ('PAID', 'PARTIAL', 'OUTSTANDING'))
);

ALTER TABLE calendar_entries
  ADD COLUMN IF NOT EXISTS course_id uuid NULL REFERENCES courses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_student_profiles_completed_at
  ON student_profiles(completed_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_calendar_entries_course_starts
  ON calendar_entries(course_id, starts_at DESC)
  WHERE course_id IS NOT NULL;
