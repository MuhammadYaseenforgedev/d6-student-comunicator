CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE finance_accounts
  ADD COLUMN IF NOT EXISTS account_status text;

ALTER TABLE finance_accounts
  ADD COLUMN IF NOT EXISTS status_note text;

UPDATE finance_accounts
SET account_status = CASE
  WHEN balance_cents > 0 THEN 'OVERDUE'
  ELSE 'OK'
END
WHERE account_status IS NULL OR btrim(account_status) = '';

ALTER TABLE finance_accounts
  ALTER COLUMN account_status SET DEFAULT 'OK';

ALTER TABLE finance_accounts
  ALTER COLUMN account_status SET NOT NULL;

ALTER TABLE finance_accounts
  DROP CONSTRAINT IF EXISTS finance_accounts_account_status_check;

ALTER TABLE finance_accounts
  ADD CONSTRAINT finance_accounts_account_status_check
  CHECK (account_status IN ('OK', 'OUTSTANDING', 'OVERDUE', 'PAYMENT_PLAN', 'HOLD'));

CREATE TABLE IF NOT EXISTS finance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'STATEMENT',
  title text NOT NULL,
  description text NULL,
  amount_cents integer NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  issued_at timestamptz NOT NULL DEFAULT now(),
  document_url text NULL,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_documents_type_check
    CHECK (type IN ('STATEMENT', 'INVOICE', 'NOTICE', 'RECEIPT', 'PAYMENT_PLAN'))
);

CREATE INDEX IF NOT EXISTS idx_finance_documents_user_issued
  ON finance_documents(user_id, issued_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS finance_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'INFO',
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_notifications_severity_check
    CHECK (severity IN ('INFO', 'SUCCESS', 'WARNING', 'URGENT'))
);

CREATE INDEX IF NOT EXISTS idx_finance_notifications_user_created
  ON finance_notifications(user_id, created_at DESC);
