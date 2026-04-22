-- Core baseline schema for local demo bootstrap.
-- Safe to run repeatedly.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'LECTURER', 'STUDENT', 'PARENT')),
  can_link_children boolean NOT NULL DEFAULT false,
  public_student_id text NULL,
  south_african_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_student_id_unique
  ON users(public_student_id)
  WHERE public_student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_south_african_id_unique
  ON users(south_african_id)
  WHERE south_african_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON users(lower(email));

CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  is_private boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channels_created_at
  ON channels(created_at DESC);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_user_id
  ON channel_members(user_id);

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_channel_created
  ON announcements(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_announcements_channel_pinned_created
  ON announcements(channel_id, pinned DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_created
  ON messages(channel_id, created_at ASC);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NULL,
  location text NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_channel_starts
  ON events(channel_id, starts_at ASC);

CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('LECTURER_MATERIAL', 'STUDENT_SUBMISSION')),
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  storage_path text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploads_created_at
  ON uploads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_by
  ON uploads(uploaded_by);

CREATE TABLE IF NOT EXISTS threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS thread_participants (
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archived_at timestamptz NULL,
  archived_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE thread_participants
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

ALTER TABLE thread_participants
  ADD COLUMN IF NOT EXISTS archived_by uuid NULL REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_thread_participants_user_id
  ON thread_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_thread_participants_user_archived
  ON thread_participants(user_id, archived_at);

CREATE TABLE IF NOT EXISTS thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_created_at_desc
  ON thread_messages(thread_id, created_at DESC);

