ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS verified_from_talent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_source text NULL,
  ADD COLUMN IF NOT EXISTS external_source_id text NULL,
  ADD COLUMN IF NOT EXISTS locked_fields jsonb NULL,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_profiles_external_source_unique
  ON student_profiles(external_source, external_source_id)
  WHERE external_source IS NOT NULL
    AND external_source_id IS NOT NULL;
