-- =========================
--  ID + OTP redesign
-- =========================

-- 1) Users: parent permission to link children
ALTER TABLE users
ADD COLUMN IF NOT EXISTS can_link_children boolean NOT NULL DEFAULT false;

-- 2) Users: student public ID (used by parents instead of email)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS public_student_id text;

-- Ensure uniqueness, allow NULLs for non-students
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_student_id_unique
ON users(public_student_id)
WHERE public_student_id IS NOT NULL;

-- 3) OTP table (codes are hashed, never stored in plain text)
CREATE TABLE IF NOT EXISTS email_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL,            -- 'LOGIN' | 'REGISTER'
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_otps_email_purpose_created
ON email_otps (lower(email), purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_otps_expires
ON email_otps (expires_at);
