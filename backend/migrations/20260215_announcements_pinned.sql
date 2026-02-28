ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
