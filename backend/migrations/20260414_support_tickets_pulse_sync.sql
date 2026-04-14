ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS external_system text NULL,
  ADD COLUMN IF NOT EXISTS external_reference text NULL,
  ADD COLUMN IF NOT EXISTS pulse_sync_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS pulse_synced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pulse_sync_error text NULL;

UPDATE support_tickets
SET external_system = COALESCE(NULLIF(btrim(external_system), ''), 'pulse')
WHERE external_system IS NULL OR btrim(external_system) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_tickets_pulse_sync_status_valid'
  ) THEN
    ALTER TABLE support_tickets
      ADD CONSTRAINT support_tickets_pulse_sync_status_valid
      CHECK (
        pulse_sync_status IN ('PENDING', 'SYNCED', 'FAILED', 'SKIPPED')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_tickets_pulse_sync_status_created
  ON support_tickets(pulse_sync_status, created_at DESC);
