import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../config/db";
import { requireRole } from "../middleware/rbac";

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function demoSeedEnabled(): boolean {
  return String(process.env.DEMO_SEED_ENABLED ?? "").trim().toLowerCase() === "true";
}

type DemoUserInput = {
  email: string;
  role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";
  firstName: string;
  lastName: string;
  courseName: string | null;
  publicStudentId?: string | null;
};

async function upsertDemoUser(
  client: {
    query: <T>(text: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
  },
  passwordHash: string,
  input: DemoUserInput
): Promise<string> {
  const row = await client.query<{ id: string }>(
    `
      INSERT INTO users (
        email,
        password_hash,
        role,
        first_name,
        last_name,
        course_name,
        public_student_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (email)
      DO UPDATE SET
        role = EXCLUDED.role,
        first_name = CASE
          WHEN users.first_name IS NULL OR btrim(users.first_name) = '' THEN EXCLUDED.first_name
          ELSE users.first_name
        END,
        last_name = CASE
          WHEN users.last_name IS NULL OR btrim(users.last_name) = '' THEN EXCLUDED.last_name
          ELSE users.last_name
        END,
        course_name = CASE
          WHEN users.course_name IS NULL OR btrim(users.course_name) = '' THEN EXCLUDED.course_name
          ELSE users.course_name
        END,
        public_student_id = CASE
          WHEN users.public_student_id IS NULL OR btrim(users.public_student_id) = '' THEN EXCLUDED.public_student_id
          ELSE users.public_student_id
        END
      RETURNING id
    `,
    [
      input.email,
      passwordHash,
      input.role,
      input.firstName,
      input.lastName,
      input.courseName,
      input.publicStudentId ?? null,
    ]
  );

  return row.rows[0].id;
}

export const demoRouter = Router();

// POST /api/demo/seed-attendance
demoRouter.post("/seed-attendance", requireRole("ADMIN"), async (_req, res) => {
  if (!demoSeedEnabled()) {
    return err(res, 404, "NOT_FOUND", "Route not found");
  }

  const FACULTY_NAME = "Demo Faculty";
  const MODULE_CODE = "DEMO-CS101";
  const MODULE_NAME = "Demo Intro to CS";
  const LECTURER_EMAIL = "demo+lecturer@local.test";
  const STUDENT_1_EMAIL = "demo+student1@local.test";
  const STUDENT_2_EMAIL = "demo+student2@local.test";
  const todayUtc = new Date().toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const passwordHash = await bcrypt.hash("DemoPassw0rd!", 10);

    const faculty = await client.query<{ id: string }>(
      `
        INSERT INTO faculties (name)
        VALUES ($1)
        ON CONFLICT (name)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `,
      [FACULTY_NAME]
    );
    const facultyId = faculty.rows[0].id;

    const moduleRes = await client.query<{ id: string }>(
      `
        INSERT INTO faculty_modules (faculty_id, code, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (code)
        DO UPDATE SET
          faculty_id = EXCLUDED.faculty_id,
          name = EXCLUDED.name
        RETURNING id
      `,
      [facultyId, MODULE_CODE, MODULE_NAME]
    );
    const moduleId = moduleRes.rows[0].id;

    const lecturerId = await upsertDemoUser(client, passwordHash, {
      email: LECTURER_EMAIL,
      role: "LECTURER",
      firstName: "Demo",
      lastName: "Lecturer",
      courseName: null,
      publicStudentId: null,
    });

    const student1Id = await upsertDemoUser(client, passwordHash, {
      email: STUDENT_1_EMAIL,
      role: "STUDENT",
      firstName: "Demo",
      lastName: "Student One",
      courseName: "Demo Intro to CS",
      publicStudentId: "DEMO-STUDENT-1",
    });

    const student2Id = await upsertDemoUser(client, passwordHash, {
      email: STUDENT_2_EMAIL,
      role: "STUDENT",
      firstName: "Demo",
      lastName: "Student Two",
      courseName: "Demo Intro to CS",
      publicStudentId: "DEMO-STUDENT-2",
    });

    await client.query(
      `
        INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, lecturer_id) DO NOTHING
      `,
      [moduleId, lecturerId]
    );

    await client.query(
      `
        INSERT INTO student_module_enrollments (module_id, student_id)
        VALUES ($1, $2), ($1, $3)
        ON CONFLICT (module_id, student_id) DO NOTHING
      `,
      [moduleId, student1Id, student2Id]
    );

    const existingSession = await client.query<{ id: string }>(
      `
        SELECT id
        FROM attendance_sessions
        WHERE lecturer_id = $1
          AND module_id = $2
          AND attendance_date = $3::date
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [lecturerId, moduleId, todayUtc]
    );

    let sessionId = existingSession.rows[0]?.id ?? "";
    if (!sessionId) {
      const createdSession = await client.query<{ id: string }>(
        `
          INSERT INTO attendance_sessions (lecturer_id, module_id, attendance_date, created_by)
          VALUES ($1, $2, $3::date, $1)
          RETURNING id
        `,
        [lecturerId, moduleId, todayUtc]
      );
      sessionId = createdSession.rows[0].id;
    }

    const marked: Array<{ studentId: string; status: "PRESENT" | "ABSENT" }> = [];
    const seedMarks: Array<{ studentId: string; status: "PRESENT" | "ABSENT" }> = [
      { studentId: student1Id, status: "PRESENT" },
      { studentId: student2Id, status: "ABSENT" },
    ];

    for (const mark of seedMarks) {
      await client.query(
        `
          INSERT INTO attendance_records (session_id, student_id, status, marked_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (session_id, student_id)
          DO UPDATE SET
            status = EXCLUDED.status,
            marked_at = now(),
            marked_by = EXCLUDED.marked_by
        `,
        [sessionId, mark.studentId, mark.status, lecturerId]
      );
      marked.push(mark);
    }

    await client.query("COMMIT");

    return res.status(200).json({
      moduleId,
      lecturerId,
      studentIds: [student1Id, student2Id],
      sessionId,
      marked,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[demo] POST /demo/seed-attendance error", e);
    return err(res, 500, "INTERNAL", "Failed to seed attendance demo");
  } finally {
    client.release();
  }
});
