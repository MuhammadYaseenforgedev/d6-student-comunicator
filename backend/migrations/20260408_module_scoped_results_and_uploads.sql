ALTER TABLE assessment_results
  ADD COLUMN IF NOT EXISTS module_id uuid NULL REFERENCES faculty_modules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assessment_results_module
  ON assessment_results(module_id, assessed_at DESC);

ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS module_id uuid NULL REFERENCES faculty_modules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_uploads_module_id
  ON uploads(module_id, created_at DESC);
