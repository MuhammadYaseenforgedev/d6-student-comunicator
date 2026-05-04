ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL;

ALTER TABLE announcements
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 days');

UPDATE announcements
SET expires_at = now() + interval '30 days'
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_channel_expires_created
  ON announcements(channel_id, expires_at, pinned DESC, created_at DESC);
