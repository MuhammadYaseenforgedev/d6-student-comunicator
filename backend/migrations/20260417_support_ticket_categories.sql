ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS subject text NULL,
  ADD COLUMN IF NOT EXISTS creator_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_profile_user_id uuid NULL REFERENCES student_profiles(user_id) ON DELETE SET NULL;

UPDATE support_tickets
SET category = 'GENERAL'
WHERE category IS NULL OR btrim(category) = '';

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_status_check;

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_status_valid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_tickets_status_valid'
  ) THEN
    ALTER TABLE support_tickets
      ADD CONSTRAINT support_tickets_status_valid
      CHECK (
        status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED')
      );
  END IF;
END $$;

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_check;

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_valid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_tickets_category_valid'
  ) THEN
    ALTER TABLE support_tickets
      ADD CONSTRAINT support_tickets_category_valid
      CHECK (
        category IN ('GENERAL', 'INCORRECT_DETAILS')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_tickets_category_status_created
  ON support_tickets(category, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_target_user_created
  ON support_tickets(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;
