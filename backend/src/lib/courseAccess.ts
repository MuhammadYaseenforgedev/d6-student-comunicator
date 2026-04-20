import { syncCalendarForAssignedCourse } from "./courseCalendarSync";

type Queryable = {
  query: <T>(
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

type CourseEnrollmentStatus = "ACTIVE" | "INACTIVE";

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

export async function isLecturerAssignedToModule(
  db: Queryable,
  lecturerId: string,
  moduleId: string
): Promise<boolean> {
  const result = await db.query(
    `
      SELECT 1
      FROM lecturer_module_assignments
      WHERE lecturer_id = $1
        AND module_id = $2
      LIMIT 1
    `,
    [lecturerId, moduleId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function isLecturerAssignedToCourse(
  db: Queryable,
  lecturerId: string,
  courseId: string
): Promise<boolean> {
  const result = await db.query(
    `
      SELECT 1
      FROM lecturer_module_assignments lma
      JOIN faculty_modules fm ON fm.id = lma.module_id
      WHERE lma.lecturer_id = $1
        AND fm.course_id = $2
      LIMIT 1
    `,
    [lecturerId, courseId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function isLecturerAllowedForStudent(
  db: Queryable,
  lecturerId: string,
  studentId: string
): Promise<boolean> {
  const result = await db.query(
    `
      SELECT 1
      FROM lecturer_module_assignments lma
      JOIN faculty_modules fm ON fm.id = lma.module_id
      JOIN student_module_enrollments sme
        ON sme.module_id = fm.id
       AND sme.student_id = $2
      JOIN student_courses sc
        ON sc.student_user_id = sme.student_id
       AND sc.course_id = fm.course_id
       AND sc.status = 'ACTIVE'
      WHERE lma.lecturer_id = $1
      LIMIT 1
    `,
    [lecturerId, studentId]
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

export async function syncStudentModulesForCourse(
  db: Queryable,
  studentId: string,
  courseId: string
): Promise<number> {
  const result = await db.query<{ inserted_count: number }>(
    `
      WITH course_modules AS (
        SELECT fm.id
        FROM faculty_modules fm
        WHERE fm.course_id = $2
      ),
      inserted AS (
        INSERT INTO student_module_enrollments (module_id, student_id)
        SELECT cm.id, $1
        FROM course_modules cm
        ON CONFLICT (module_id, student_id) DO NOTHING
        RETURNING module_id
      )
      SELECT COUNT(*)::int AS inserted_count
      FROM inserted
    `,
    [studentId, courseId]
  );

  return Number(result.rows[0]?.inserted_count ?? 0);
}

export async function assignCourseToStudent(
  db: Queryable,
  input: {
    studentId: string;
    courseId: string;
    status?: CourseEnrollmentStatus;
    deactivateOtherCourses?: boolean;
  }
): Promise<void> {
  const status = input.status ?? "ACTIVE";

  if (input.deactivateOtherCourses) {
    await db.query(
      `
        UPDATE student_courses
        SET status = 'INACTIVE'
        WHERE student_user_id = $1
          AND course_id <> $2
          AND status = 'ACTIVE'
      `,
      [input.studentId, input.courseId]
    );
  }

  await db.query(
    `
      INSERT INTO student_courses (student_user_id, course_id, status, enrolled_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (student_user_id, course_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        enrolled_at = CASE
          WHEN student_courses.status = EXCLUDED.status THEN student_courses.enrolled_at
          ELSE now()
        END
    `,
    [input.studentId, input.courseId, status]
  );

  if (status === "ACTIVE") {
    await syncStudentModulesForCourse(db, input.studentId, input.courseId);
    await syncCalendarForAssignedCourse(db, {
      studentId: input.studentId,
      courseId: input.courseId,
    });
  }
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
