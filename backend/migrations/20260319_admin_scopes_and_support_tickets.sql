ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_scope text NULL;

UPDATE users
SET admin_scope = 'SUPER'
WHERE role = 'ADMIN'
  AND (admin_scope IS NULL OR btrim(admin_scope) = '');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_admin_scope_valid'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_admin_scope_valid
      CHECK (
        admin_scope IS NULL
        OR admin_scope IN ('FINANCE', 'ACADEMIC', 'SUPER')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_email text NOT NULL,
  requester_name text NULL,
  device_number text NULL,
  issue_type text NOT NULL CHECK (
    issue_type IN ('ACCOUNT_ACCESS', 'NETWORK', 'POWER', 'SOFTWARE', 'DEVICE', 'OTHER')
  ),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (
    status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')
  ),
  admin_note text NULL,
  assigned_to uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_requester_email
  ON support_tickets(lower(requester_email), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created
  ON support_tickets(status, created_at DESC);
