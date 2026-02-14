-- Adds a helpful index for thread message pagination (safe to re-run)
CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_created_at_desc
  ON thread_messages(thread_id, created_at DESC);
