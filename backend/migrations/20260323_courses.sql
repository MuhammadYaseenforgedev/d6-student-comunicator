CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_courses (
  student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (
    status IN ('ACTIVE', 'INACTIVE')
  ),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_student_courses_course_status
  ON student_courses(course_id, status, enrolled_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_courses_student_status
  ON student_courses(student_user_id, status, enrolled_at DESC);

ALTER TABLE faculty_modules
  ADD COLUMN IF NOT EXISTS course_id uuid NULL REFERENCES courses(id) ON DELETE RESTRICT;

INSERT INTO courses (code, name, description, is_active)
VALUES (
  'LEGACY-GENERAL',
  'Legacy General Course',
  'Backfilled legacy course for existing modules created before course management was introduced.',
  true
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();

UPDATE faculty_modules
SET course_id = (
  SELECT id
  FROM courses
  WHERE code = 'LEGACY-GENERAL'
  LIMIT 1
)
WHERE course_id IS NULL;

ALTER TABLE faculty_modules
  ALTER COLUMN course_id SET NOT NULL;

INSERT INTO student_courses (student_user_id, course_id, status, enrolled_at)
SELECT DISTINCT
  sme.student_id,
  fm.course_id,
  'ACTIVE',
  now()
FROM student_module_enrollments sme
JOIN faculty_modules fm ON fm.id = sme.module_id
WHERE fm.course_id IS NOT NULL
ON CONFLICT (student_user_id, course_id) DO NOTHING;

WITH ranked_courses AS (
  SELECT DISTINCT ON (sc.student_user_id)
    sc.student_user_id,
    c.name
  FROM student_courses sc
  JOIN courses c ON c.id = sc.course_id
  WHERE sc.status = 'ACTIVE'
  ORDER BY sc.student_user_id, sc.enrolled_at DESC, c.name ASC
)
UPDATE users u
SET course_name = ranked_courses.name
FROM ranked_courses
WHERE u.id = ranked_courses.student_user_id
  AND u.role = 'STUDENT';

UPDATE users u
SET course_name = NULL
WHERE u.role = 'STUDENT'
  AND NOT EXISTS (
    SELECT 1
    FROM student_courses sc
    WHERE sc.student_user_id = u.id
      AND sc.status = 'ACTIVE'
  );
