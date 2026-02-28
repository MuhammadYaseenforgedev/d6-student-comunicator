-- Calendar + Finance scaffolding
-- Safe create (IF NOT EXISTS). Run once.

-- Needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- Calendar: personal calendar entries
-- =========================
CREATE TABLE IF NOT EXISTS calendar_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NULL,
  location text NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_entries_user_starts
  ON calendar_entries(user_id, starts_at DESC);

-- =========================
-- Finance: user accounts + transactions
-- =========================
CREATE TABLE IF NOT EXISTS finance_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  description text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_tx_user_occurred
  ON finance_transactions(user_id, occurred_at DESC);
