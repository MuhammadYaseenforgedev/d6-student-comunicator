-- ===============================
-- Parent-Child linking
-- ===============================

CREATE TABLE IF NOT EXISTS parent_links (
  parent_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_user_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_links_parent_user_id
  ON parent_links(parent_user_id);

CREATE INDEX IF NOT EXISTS idx_parent_links_student_user_id
  ON parent_links(student_user_id);
