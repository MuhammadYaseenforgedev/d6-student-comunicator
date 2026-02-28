-- =========================
--  Student identity fields
-- =========================

-- South African ID used for parent-child linking
ALTER TABLE users
ADD COLUMN IF NOT EXISTS south_african_id text;

-- Ensure one SA ID maps to at most one account
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_south_african_id_unique
ON users(south_african_id)
WHERE south_african_id IS NOT NULL;
