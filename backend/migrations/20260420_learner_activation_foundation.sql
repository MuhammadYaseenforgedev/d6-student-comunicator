ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS activation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_status text NULL,
  ADD COLUMN IF NOT EXISTS activation_invited_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz NULL;

ALTER TABLE student_profiles
  DROP CONSTRAINT IF EXISTS student_profiles_onboarding_status_valid;

ALTER TABLE student_profiles
  ADD CONSTRAINT student_profiles_onboarding_status_valid
  CHECK (
    onboarding_status IS NULL
    OR onboarding_status IN ('PENDING_ACTIVATION', 'INVITED', 'ACTIVATED')
  ) NOT VALID;

ALTER TABLE student_profiles
  VALIDATE CONSTRAINT student_profiles_onboarding_status_valid;

CREATE TABLE IF NOT EXISTS learner_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learner_activation_tokens_user_active
  ON learner_activation_tokens(user_id, created_at DESC)
  WHERE consumed_at IS NULL
    AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_learner_activation_tokens_expires
  ON learner_activation_tokens(expires_at);
