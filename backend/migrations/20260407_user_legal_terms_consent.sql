ALTER TABLE users
  ADD COLUMN IF NOT EXISTS accepted_legal_terms_at timestamptz NULL;
