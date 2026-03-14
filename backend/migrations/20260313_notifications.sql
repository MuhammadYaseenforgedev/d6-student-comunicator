CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (
    category IN (
      'MESSAGE',
      'ANNOUNCEMENT',
      'EMERGENCY',
      'ATTENDANCE',
      'RESULT',
      'FINANCE',
      'PARENT_LINK'
    )
  ),
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_key text NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON user_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread_created
  ON user_notifications(user_id, is_read, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notifications_user_source_key
  ON user_notifications(user_id, source_key)
  WHERE source_key IS NOT NULL;
