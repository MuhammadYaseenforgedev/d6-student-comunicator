ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS module_id uuid NULL REFERENCES faculty_modules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_channel_module_created
  ON announcements(channel_id, module_id, created_at DESC);
