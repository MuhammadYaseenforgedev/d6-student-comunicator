import { Router } from "express";
import { pool } from "../config/db";
import { requireRole } from "../middleware/rbac";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";
const VALID_ATTENDANCE_STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE"];

type AuthRole = "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function parseDateOnly(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normalizeStatus(raw: unknown): AttendanceStatus | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return VALID_ATTENDANCE_STATUSES.includes(s as AttendanceStatus) ? (s as AttendanceStatus) : null;
}

async function isLecturerAssignedToModule(lecturerId: string, moduleId: string): Promise<boolean> {
  const q = `
    SELECT 1
    FROM lecturer_module_assignments
    WHERE lecturer_id = $1
      AND module_id = $2
    LIMIT 1
  `;
  const r = await pool.query(q, [lecturerId, moduleId]);
  return (r.rowCount ?? 0) > 0;
}

async function ensureParentCanAccessChild(parentId: string, childId: string): Promise<boolean> {
  const q = `
    SELECT 1
    FROM parent_links
    WHERE parent_user_id = $1
      AND student_user_id = $2
    LIMIT 1
  `;
  const r = await pool.query(q, [parentId, childId]);
  return (r.rowCount ?? 0) > 0;
}

export const attendanceRouter = Router();

// Create module/faculty records (minimal admin utility for attendance setup).
attendanceRouter.post("/attendance/modules", requireRole("ADMIN"), async (req, res) => {
  try {
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    const name = String(req.body?.name ?? "").trim();
    const facultyIdRaw = String(req.body?.facultyId ?? "").trim();
    const facultyName = String(req.body?.facultyName ?? "").trim();

    if (!code) return err(res, 400, "VALIDATION", "code is required");
    if (!name) return err(res, 400, "VALIDATION", "name is required");

    let facultyId = facultyIdRaw;
    if (facultyId) {
      if (!isUuid(facultyId)) return err(res, 400, "VALIDATION", "facultyId must be a UUID");
      const f = await pool.query(`SELECT 1 FROM faculties WHERE id = $1 LIMIT 1`, [facultyId]);
      if ((f.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Faculty not found");
    } else {
      if (!facultyName) {
        return err(res, 400, "VALIDATION", "facultyName is required when facultyId is not provided");
      }
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM faculties WHERE lower(name) = lower($1) LIMIT 1`,
        [facultyName]
      );
      if ((existing.rowCount ?? 0) > 0) {
        facultyId = existing.rows[0].id;
      } else {
        const createdFaculty = await pool.query<{ id: string }>(
          `INSERT INTO faculties (name) VALUES ($1) RETURNING id`,
          [facultyName]
        );
        facultyId = createdFaculty.rows[0].id;
      }
    }

    const created = await pool.query<{ id: string; faculty_id: string; code: string; name: string }>(
      `
        INSERT INTO faculty_modules (faculty_id, code, name)
        VALUES ($1, $2, $3)
        RETURNING id, faculty_id, code, name
      `,
      [facultyId, code, name]
    );

    return res.status(201).json({
      id: created.rows[0].id,
      facultyId: created.rows[0].faculty_id,
      code: created.rows[0].code,
      name: created.rows[0].name,
    });
  } catch (e: any) {
    if (String(e?.code ?? "") === "23505") {
      return err(res, 400, "VALIDATION", "Module code already exists");
    }
    console.error("[attendance] POST /attendance/modules error", e);
    return err(res, 500, "INTERNAL", "Failed to create module");
  }
});

// Assign lecturer to module.
attendanceRouter.post("/attendance/modules/:moduleId/lecturers", requireRole("ADMIN"), async (req, res) => {
  try {
    const moduleId = String(req.params.moduleId ?? "").trim();
    const lecturerId = String(req.body?.lecturerId ?? "").trim();

    if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");
    if (!isUuid(lecturerId)) return err(res, 400, "VALIDATION", "lecturerId must be a UUID");

    const moduleRes = await pool.query(`SELECT 1 FROM faculty_modules WHERE id = $1 LIMIT 1`, [moduleId]);
    if ((moduleRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Module not found");

    const lecturer = await pool.query(
      `
        SELECT 1
        FROM users
        WHERE id = $1
          AND role = 'LECTURER'
        LIMIT 1
      `,
      [lecturerId]
    );
    if ((lecturer.rowCount ?? 0) === 0) {
      return err(res, 404, "NOT_FOUND", "Lecturer not found");
    }

    const inserted = await pool.query(
      `
        INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, lecturer_id) DO NOTHING
      `,
      [moduleId, lecturerId]
    );

    return res.status(200).json({ ok: true, created: (inserted.rowCount ?? 0) > 0 });
  } catch (e) {
    console.error("[attendance] POST /attendance/modules/:moduleId/lecturers error", e);
    return err(res, 500, "INTERNAL", "Failed to assign lecturer");
  }
});

// Enroll student to module and expose auto-linked lecturers for attendance/messaging workflows.
attendanceRouter.post("/attendance/modules/:moduleId/enrollments", requireRole("ADMIN"), async (req, res) => {
  try {
    const moduleId = String(req.params.moduleId ?? "").trim();
    const studentId = String(req.body?.studentId ?? "").trim();

    if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");
    if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

    const moduleRes = await pool.query(`SELECT 1 FROM faculty_modules WHERE id = $1 LIMIT 1`, [moduleId]);
    if ((moduleRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Module not found");

    const student = await pool.query(
      `
        SELECT 1
        FROM users
        WHERE id = $1
          AND role = 'STUDENT'
        LIMIT 1
      `,
      [studentId]
    );
    if ((student.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Student not found");

    const inserted = await pool.query(
      `
        INSERT INTO student_module_enrollments (module_id, student_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, student_id) DO NOTHING
      `,
      [moduleId, studentId]
    );

    const lecturers = await pool.query<{ id: string; email: string }>(
      `
        SELECT u.id, u.email
        FROM lecturer_module_assignments lma
        JOIN users u ON u.id = lma.lecturer_id
        WHERE lma.module_id = $1
        ORDER BY lower(u.email) ASC
      `,
      [moduleId]
    );

    return res.status(200).json({
      ok: true,
      created: (inserted.rowCount ?? 0) > 0,
      linkedLecturers: lecturers.rows,
    });
  } catch (e) {
    console.error("[attendance] POST /attendance/modules/:moduleId/enrollments error", e);
    return err(res, 500, "INTERNAL", "Failed to enroll student");
  }
});

// List modules available for attendance workflows.
attendanceRouter.get("/attendance/modules", requireRole("LECTURER", "ADMIN"), async (req, res) => {
  try {
    const user = req.user!;
    const isAdmin = user.role === "ADMIN";

    const params: unknown[] = [];
    const where: string[] = [];
    if (!isAdmin) {
      params.push(user.id);
      where.push(`EXISTS (
        SELECT 1
        FROM lecturer_module_assignments lma2
        WHERE lma2.module_id = fm.id
          AND lma2.lecturer_id = $${params.length}
      )`);
    }

    const sql = `
      SELECT
        fm.id,
        fm.code,
        fm.name,
        f.name AS faculty_name,
        COUNT(DISTINCT sme.student_id)::int AS enrolled_count,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', lu.id,
              'email', lu.email
            )
          ) FILTER (WHERE lu.id IS NOT NULL),
          '[]'::json
        ) AS lecturers
      FROM faculty_modules fm
      JOIN faculties f ON f.id = fm.faculty_id
      LEFT JOIN student_module_enrollments sme ON sme.module_id = fm.id
      LEFT JOIN lecturer_module_assignments lma ON lma.module_id = fm.id
      LEFT JOIN users lu ON lu.id = lma.lecturer_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      GROUP BY fm.id, fm.code, fm.name, f.name
      ORDER BY f.name ASC, fm.code ASC
    `;

    const rows = await pool.query<{
      id: string;
      code: string;
      name: string;
      faculty_name: string;
      enrolled_count: number;
      lecturers: unknown;
    }>(sql, params);

    const value = rows.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      facultyName: row.faculty_name,
      enrolledCount: Number(row.enrolled_count ?? 0),
      lecturers: Array.isArray(row.lecturers) ? row.lecturers : [],
    }));

    return res.json({ value, count: value.length });
  } catch (e) {
    console.error("[attendance] GET /attendance/modules error", e);
    return err(res, 500, "INTERNAL", "Failed to list modules");
  }
});

// List students enrolled in one module.
attendanceRouter.get("/attendance/modules/:moduleId/students", requireRole("LECTURER", "ADMIN"), async (req, res) => {
  try {
    const user = req.user!;
    const moduleId = String(req.params.moduleId ?? "").trim();
    if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");

    const moduleRes = await pool.query(`SELECT 1 FROM faculty_modules WHERE id = $1 LIMIT 1`, [moduleId]);
    if ((moduleRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Module not found");

    if (user.role === "LECTURER") {
      const ok = await isLecturerAssignedToModule(user.id, moduleId);
      if (!ok) return err(res, 403, "FORBIDDEN", "Lecturer is not assigned to this module");
    }

    const rows = await pool.query<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      course_name: string | null;
      public_student_id: string | null;
    }>(
      `
        SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.course_name,
          u.public_student_id
        FROM student_module_enrollments sme
        JOIN users u ON u.id = sme.student_id
        WHERE sme.module_id = $1
        ORDER BY lower(u.email) ASC
      `,
      [moduleId]
    );

    const value = rows.rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      courseName: r.course_name,
      studentNumber: r.public_student_id,
    }));

    return res.json({ value, count: value.length });
  } catch (e) {
    console.error("[attendance] GET /attendance/modules/:moduleId/students error", e);
    return err(res, 500, "INTERNAL", "Failed to list module students");
  }
});

// Create session.
attendanceRouter.post("/attendance/sessions", requireRole("LECTURER", "ADMIN"), async (req, res) => {
  try {
    const user = req.user!;
    const role = String(user.role ?? "").toUpperCase() as AuthRole;

    const moduleId = String(req.body?.moduleId ?? "").trim();
    if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");

    const date = parseDateOnly(req.body?.date) ?? new Date().toISOString().slice(0, 10);
    const startsAt = String(req.body?.startsAt ?? "").trim() || null;
    const endsAt = String(req.body?.endsAt ?? "").trim() || null;

    let lecturerId = user.id;
    if (role === "ADMIN") {
      lecturerId = String(req.body?.lecturerId ?? "").trim();
      if (!isUuid(lecturerId)) {
        return err(res, 400, "VALIDATION", "lecturerId is required for ADMIN and must be a UUID");
      }
    }

    if (role === "LECTURER" && lecturerId !== user.id) {
      return err(res, 403, "FORBIDDEN", "Lecturer can only create sessions for self");
    }

    const moduleRes = await pool.query<{ id: string; code: string; name: string }>(
      `
        SELECT id, code, name
        FROM faculty_modules
        WHERE id = $1
        LIMIT 1
      `,
      [moduleId]
    );
    if ((moduleRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Module not found");

    const assigned = await isLecturerAssignedToModule(lecturerId, moduleId);
    if (!assigned) {
      return err(
        res,
        403,
        "FORBIDDEN",
        "Attendance sessions can only be created for lecturers assigned to this module"
      );
    }

    const created = await pool.query<{
      id: string;
      lecturer_id: string;
      module_id: string;
      attendance_date: string;
      starts_at: string | null;
      ends_at: string | null;
      created_at: string;
    }>(
      `
        INSERT INTO attendance_sessions (
          lecturer_id,
          module_id,
          attendance_date,
          starts_at,
          ends_at,
          created_by
        )
        VALUES ($1, $2, $3::date, $4::timestamptz, $5::timestamptz, $6)
        RETURNING id, lecturer_id, module_id, attendance_date, starts_at, ends_at, created_at
      `,
      [lecturerId, moduleId, date, startsAt, endsAt, user.id]
    );

    const row = created.rows[0];
    return res.status(201).json({
      id: row.id,
      lecturerId: row.lecturer_id,
      moduleId: row.module_id,
      date: row.attendance_date,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      createdAt: row.created_at,
    });
  } catch (e) {
    console.error("[attendance] POST /attendance/sessions error", e);
    return err(res, 500, "INTERNAL", "Failed to create attendance session");
  }
});

// List sessions.
attendanceRouter.get("/attendance/sessions", requireRole("LECTURER", "ADMIN"), async (req, res) => {
  try {
    const user = req.user!;
    const moduleIdRaw = String(req.query.moduleId ?? "").trim();
    const dateRaw = String(req.query.date ?? "").trim();

    const params: unknown[] = [];
    const where: string[] = [];

    if (user.role === "LECTURER") {
      params.push(user.id);
      where.push(`s.lecturer_id = $${params.length}`);
    }

    if (moduleIdRaw) {
      if (!isUuid(moduleIdRaw)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");
      params.push(moduleIdRaw);
      where.push(`s.module_id = $${params.length}`);
    }

    if (dateRaw) {
      const date = parseDateOnly(dateRaw);
      if (!date) return err(res, 400, "VALIDATION", "date must be YYYY-MM-DD");
      params.push(date);
      where.push(`s.attendance_date = $${params.length}::date`);
    }

    const rows = await pool.query<{
      id: string;
      lecturer_id: string;
      module_id: string;
      attendance_date: string;
      starts_at: string | null;
      ends_at: string | null;
      created_at: string;
      module_code: string;
      module_name: string;
      faculty_name: string;
    }>(
      `
        SELECT
          s.id,
          s.lecturer_id,
          s.module_id,
          s.attendance_date,
          s.starts_at,
          s.ends_at,
          s.created_at,
          fm.code AS module_code,
          fm.name AS module_name,
          f.name AS faculty_name
        FROM attendance_sessions s
        JOIN faculty_modules fm ON fm.id = s.module_id
        JOIN faculties f ON f.id = fm.faculty_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY s.attendance_date DESC, s.created_at DESC
      `,
      params
    );

    const value = rows.rows.map((r) => ({
      id: r.id,
      lecturerId: r.lecturer_id,
      moduleId: r.module_id,
      moduleCode: r.module_code,
      moduleName: r.module_name,
      facultyName: r.faculty_name,
      date: r.attendance_date,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      createdAt: r.created_at,
    }));

    return res.json({ value, count: value.length });
  } catch (e) {
    console.error("[attendance] GET /attendance/sessions error", e);
    return err(res, 500, "INTERNAL", "Failed to list attendance sessions");
  }
});

// Mark attendance.
attendanceRouter.post("/attendance/sessions/:id/mark", requireRole("LECTURER", "ADMIN"), async (req, res) => {
  const sessionId = String(req.params.id ?? "").trim();
  if (!isUuid(sessionId)) return err(res, 400, "VALIDATION", "session id must be a UUID");

  const marksRaw = Array.isArray(req.body) ? req.body : [];
  if (marksRaw.length === 0) {
    return err(res, 400, "VALIDATION", "Body must be a non-empty array of { studentId, status }");
  }

  const marks = marksRaw
    .map((row) => ({
      studentId: String((row as { studentId?: unknown }).studentId ?? "").trim(),
      status: normalizeStatus((row as { status?: unknown }).status),
    }))
    .filter((row) => row.studentId && row.status !== null);

  if (marks.length !== marksRaw.length) {
    return err(
      res,
      400,
      "VALIDATION",
      `Each row must include valid studentId UUID + status in [${VALID_ATTENDANCE_STATUSES.join(", ")}]`
    );
  }

  for (const m of marks) {
    if (!isUuid(m.studentId)) {
      return err(res, 400, "VALIDATION", "studentId must be a UUID");
    }
  }

  try {
    const user = req.user!;
    const sessionRes = await pool.query<{
      id: string;
      module_id: string;
      lecturer_id: string;
    }>(
      `
        SELECT id, module_id, lecturer_id
        FROM attendance_sessions
        WHERE id = $1
        LIMIT 1
      `,
      [sessionId]
    );

    if ((sessionRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Attendance session not found");
    const session = sessionRes.rows[0];

    if (user.role === "LECTURER" && session.lecturer_id !== user.id) {
      return err(res, 403, "FORBIDDEN", "Lecturer can only mark sessions assigned to self");
    }

    if (user.role === "LECTURER") {
      const assigned = await isLecturerAssignedToModule(user.id, session.module_id);
      if (!assigned) return err(res, 403, "FORBIDDEN", "Lecturer is not assigned to this module");
    }

    const studentIds = [...new Set(marks.map((m) => m.studentId))];
    const enrolledRes = await pool.query<{ student_id: string }>(
      `
        SELECT student_id
        FROM student_module_enrollments
        WHERE module_id = $1
          AND student_id = ANY($2::uuid[])
      `,
      [session.module_id, studentIds]
    );

    const enrolled = new Set(enrolledRes.rows.map((r) => r.student_id));
    const missing = studentIds.filter((id) => !enrolled.has(id));
    if (missing.length > 0) {
      return err(res, 400, "VALIDATION", "One or more students are not enrolled in this module");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const out: Array<{
        sessionId: string;
        studentId: string;
        status: AttendanceStatus;
        markedAt: string;
        markedBy: string;
      }> = [];

      for (const m of marks) {
        const upsert = await client.query<{
          session_id: string;
          student_id: string;
          status: AttendanceStatus;
          marked_at: string;
          marked_by: string;
        }>(
          `
            INSERT INTO attendance_records (session_id, student_id, status, marked_by)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (session_id, student_id)
            DO UPDATE SET
              status = EXCLUDED.status,
              marked_by = EXCLUDED.marked_by,
              marked_at = now()
            RETURNING session_id, student_id, status, marked_at, marked_by
          `,
          [sessionId, m.studentId, m.status, user.id]
        );
        const row = upsert.rows[0];
        out.push({
          sessionId: row.session_id,
          studentId: row.student_id,
          status: row.status,
          markedAt: row.marked_at,
          markedBy: row.marked_by,
        });
      }

      await client.query("COMMIT");
      return res.json({ ok: true, count: out.length, value: out });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[attendance] POST /attendance/sessions/:id/mark error", e);
    return err(res, 500, "INTERNAL", "Failed to mark attendance");
  }
});

// Student attendance view (or parent linked-child view).
attendanceRouter.get("/attendance/me", requireRole("STUDENT", "PARENT"), async (req, res) => {
  try {
    const user = req.user!;
    const from = req.query.from ? parseDateOnly(req.query.from) : null;
    const to = req.query.to ? parseDateOnly(req.query.to) : null;
    if (req.query.from && !from) return err(res, 400, "VALIDATION", "from must be YYYY-MM-DD");
    if (req.query.to && !to) return err(res, 400, "VALIDATION", "to must be YYYY-MM-DD");

    let studentId = user.id;

    if (user.role === "PARENT") {
      const childIdRaw = String(req.query.childId ?? "").trim();
      if (childIdRaw) {
        if (!isUuid(childIdRaw)) return err(res, 400, "VALIDATION", "childId must be a UUID");
        const linked = await ensureParentCanAccessChild(user.id, childIdRaw);
        if (!linked) return err(res, 403, "FORBIDDEN", "Parent is not linked to this student");
        studentId = childIdRaw;
      } else {
        const first = await pool.query<{ student_user_id: string }>(
          `
            SELECT student_user_id
            FROM parent_links
            WHERE parent_user_id = $1
            ORDER BY created_at ASC
            LIMIT 2
          `,
          [user.id]
        );

        if ((first.rowCount ?? 0) === 0) {
          return err(res, 400, "VALIDATION", "No linked children found for parent");
        }
        if ((first.rowCount ?? 0) > 1) {
          return err(res, 400, "VALIDATION", "childId is required when multiple children are linked");
        }
        studentId = first.rows[0].student_user_id;
      }
    }

    const rows = await pool.query<{
      session_id: string;
      attendance_date: string;
      starts_at: string | null;
      ends_at: string | null;
      module_id: string;
      module_code: string;
      module_name: string;
      faculty_name: string;
      status: AttendanceStatus;
      marked_at: string;
      first_name: string | null;
      last_name: string | null;
      course_name: string | null;
      email: string;
      public_student_id: string | null;
    }>(
      `
        SELECT
          s.id AS session_id,
          s.attendance_date,
          s.starts_at,
          s.ends_at,
          fm.id AS module_id,
          fm.code AS module_code,
          fm.name AS module_name,
          f.name AS faculty_name,
          ar.status,
          ar.marked_at,
          u.first_name,
          u.last_name,
          u.course_name,
          u.email,
          u.public_student_id
        FROM attendance_records ar
        JOIN attendance_sessions s ON s.id = ar.session_id
        JOIN faculty_modules fm ON fm.id = s.module_id
        JOIN faculties f ON f.id = fm.faculty_id
        JOIN users u ON u.id = ar.student_id
        WHERE ar.student_id = $1
          AND ($2::date IS NULL OR s.attendance_date >= $2::date)
          AND ($3::date IS NULL OR s.attendance_date <= $3::date)
        ORDER BY s.attendance_date DESC, ar.marked_at DESC
      `,
      [studentId, from, to]
    );

    const summary = {
      present: rows.rows.filter((r) => r.status === "PRESENT").length,
      absent: rows.rows.filter((r) => r.status === "ABSENT").length,
      late: rows.rows.filter((r) => r.status === "LATE").length,
      total: rows.rows.length,
    };

    const first = rows.rows[0];
    const student = first
      ? {
          id: studentId,
          email: first.email,
          firstName: first.first_name,
          lastName: first.last_name,
          courseName: first.course_name,
          studentNumber: first.public_student_id,
        }
      : { id: studentId };

    const value = rows.rows.map((r) => ({
      sessionId: r.session_id,
      date: r.attendance_date,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      moduleId: r.module_id,
      moduleCode: r.module_code,
      moduleName: r.module_name,
      facultyName: r.faculty_name,
      status: r.status,
      markedAt: r.marked_at,
    }));

    return res.json({ student, summary, value, count: value.length });
  } catch (e) {
    console.error("[attendance] GET /attendance/me error", e);
    return err(res, 500, "INTERNAL", "Failed to load attendance");
  }
});
