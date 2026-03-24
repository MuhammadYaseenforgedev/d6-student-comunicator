type Queryable = {
  query: <T>(
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export async function isStudentActiveInCourse(
  db: Queryable,
  studentId: string,
  courseId: string
): Promise<boolean> {
  const result = await db.query(
    `
      SELECT 1
      FROM student_courses
      WHERE student_user_id = $1
        AND course_id = $2
        AND status = 'ACTIVE'
      LIMIT 1
    `,
    [studentId, courseId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function isStudentAllowedForModule(
  db: Queryable,
  studentId: string,
  moduleId: string
): Promise<boolean> {
  const result = await db.query(
    `
      SELECT 1
      FROM faculty_modules fm
      JOIN student_module_enrollments sme
        ON sme.module_id = fm.id
       AND sme.student_id = $1
      JOIN student_courses sc
        ON sc.course_id = fm.course_id
       AND sc.student_user_id = $1
       AND sc.status = 'ACTIVE'
      WHERE fm.id = $2
      LIMIT 1
    `,
    [studentId, moduleId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function syncStudentCourseName(
  db: Queryable,
  studentId: string
): Promise<void> {
  await db.query(
    `
      WITH primary_course AS (
        SELECT c.name
        FROM student_courses sc
        JOIN courses c ON c.id = sc.course_id
        WHERE sc.student_user_id = $1
          AND sc.status = 'ACTIVE'
        ORDER BY sc.enrolled_at DESC, c.name ASC
        LIMIT 1
      )
      UPDATE users u
      SET course_name = (SELECT name FROM primary_course)
      WHERE u.id = $1
        AND u.role = 'STUDENT'
    `,
    [studentId]
  );
}

export async function syncStudentCourseNames(
  db: Queryable,
  studentIds: string[]
): Promise<void> {
  const uniqueStudentIds = Array.from(
    new Set(
      studentIds
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );

  for (const studentId of uniqueStudentIds) {
    await syncStudentCourseName(db, studentId);
  }
}

export async function syncCourseStudentNames(
  db: Queryable,
  courseId: string
): Promise<void> {
  const rows = await db.query<{ student_user_id: string }>(
    `
      SELECT student_user_id
      FROM student_courses
      WHERE course_id = $1
    `,
    [courseId]
  );

  await syncStudentCourseNames(
    db,
    rows.rows.map((row) => row.student_user_id)
  );
}
