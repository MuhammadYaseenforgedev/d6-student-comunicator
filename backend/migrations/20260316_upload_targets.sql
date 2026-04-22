ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS target_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL;

UPDATE uploads
SET target_user_id = uploaded_by
WHERE target_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_uploads_target_user_id
  ON uploads(target_user_id);
