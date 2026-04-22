ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS category text NULL,
  ADD COLUMN IF NOT EXISTS subject text NULL,
  ADD COLUMN IF NOT EXISTS creator_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_profile_user_id uuid NULL REFERENCES student_profiles(user_id) ON DELETE SET NULL;

ALTER TABLE support_tickets
  ALTER COLUMN category SET DEFAULT 'GENERAL';

UPDATE support_tickets
SET
  category = CASE
    WHEN category IS NULL OR btrim(category) = '' THEN 'GENERAL'
    WHEN upper(btrim(category)) IN ('GENERAL', 'INCORRECT_DETAILS') THEN upper(btrim(category))
    ELSE 'GENERAL'
  END,
  status = CASE
    WHEN status IS NULL OR btrim(status) = '' THEN 'OPEN'
    WHEN upper(btrim(status)) IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED')
      THEN upper(btrim(status))
    ELSE 'OPEN'
  END,
  subject = NULLIF(btrim(subject), '')
WHERE
  category IS NULL
  OR btrim(category) = ''
  OR upper(btrim(category)) NOT IN ('GENERAL', 'INCORRECT_DETAILS')
  OR status IS NULL
  OR btrim(status) = ''
  OR upper(btrim(status)) NOT IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED')
  OR (subject IS NOT NULL AND btrim(subject) = '');

ALTER TABLE support_tickets
  ALTER COLUMN category SET NOT NULL;

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_status_check;

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_status_valid;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_status_valid
  CHECK (
    status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED')
  ) NOT VALID;

ALTER TABLE support_tickets
  VALIDATE CONSTRAINT support_tickets_status_valid;

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_check;

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_valid;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_category_valid
  CHECK (
    category IN ('GENERAL', 'INCORRECT_DETAILS')
  ) NOT VALID;

ALTER TABLE support_tickets
  VALIDATE CONSTRAINT support_tickets_category_valid;

CREATE INDEX IF NOT EXISTS idx_support_tickets_category_status_created
  ON support_tickets(category, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_target_user_created
  ON support_tickets(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;
