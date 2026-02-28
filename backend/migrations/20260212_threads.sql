-- Threads table
CREATE TABLE IF NOT EXISTS threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Thread participants
CREATE TABLE IF NOT EXISTS thread_participants (
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (thread_id, user_id)
);

-- Thread messages
CREATE TABLE IF NOT EXISTS thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_thread_participants_user_id
  ON thread_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_id
  ON thread_messages(thread_id);

CREATE INDEX IF NOT EXISTS idx_thread_messages_created_at
  ON thread_messages(created_at DESC);
