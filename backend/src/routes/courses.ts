import { Router, type Request, type Response } from "express";
import { pool } from "../config/db";
import { requireAccess } from "../middleware/rbac";
import {
  syncCourseStudentNames,
  syncStudentCourseName,
  syncStudentCourseNames,
} from "../lib/courseAccess";

type CourseRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  enrollment_status: string | null;
  enrolled_at: string | null;
};

type CourseModuleRow = {
  id: string;
  course_id: string;
  code: string;
  name: string;
  faculty_name: string;
  enrolled_count: number;
  lecturers: unknown;
  is_student_linked: boolean | null;
};

type CourseStudentRow = {
  course_id: string;
  student_user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  public_student_id: string | null;
  status: string;
  enrolled_at: string;
};

type ModuleDeleteDependencyCounts = {
  lecturer_assignment_count: number;
  student_enrollment_count: number;
  attendance_session_count: number;
  assessment_result_count: number;
  upload_count: number;
  announcement_count: number;
};

function err(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function toBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
}

function normalizeStatus(value: unknown): "ACTIVE" | "INACTIVE" | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "INACTIVE") return normalized;
  return null;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildModuleDeleteBlockers(counts: ModuleDeleteDependencyCounts): string[] {
  const blockers: string[] = [];

  if (Number(counts.lecturer_assignment_count ?? 0) > 0) {
    blockers.push(
      pluralize(Number(counts.lecturer_assignment_count ?? 0), "lecturer assignment")
    );
  }

  if (Number(counts.student_enrollment_count ?? 0) > 0) {
    blockers.push(
      pluralize(Number(counts.student_enrollment_count ?? 0), "learner enrollment")
    );
  }

  if (Number(counts.attendance_session_count ?? 0) > 0) {
    blockers.push(
      pluralize(Number(counts.attendance_session_count ?? 0), "attendance session")
    );
  }

  if (Number(counts.assessment_result_count ?? 0) > 0) {
    blockers.push(
      pluralize(Number(counts.assessment_result_count ?? 0), "assessment result")
    );
  }

  if (Number(counts.upload_count ?? 0) > 0) {
    blockers.push(pluralize(Number(counts.upload_count ?? 0), "upload"));
  }

  if (Number(counts.announcement_count ?? 0) > 0) {
    blockers.push(
      pluralize(Number(counts.announcement_count ?? 0), "targeted announcement")
    );
  }

  return blockers;
}

function parseLecturers(raw: unknown): Array<{ id: string; email: string }> {
  return Array.isArray(raw)
    ? raw
        .map((row) => {
          const entry = row as { id?: unknown; email?: unknown };
          return {
            id: String(entry.id ?? "").trim(),
            email: String(entry.email ?? "").trim(),
          };
        })
        .filter((row) => row.id && row.email)
    : [];
}

async function getCourseRowsForUser(user: Request["user"]): Promise<CourseRow[]> {
  if (!user) return [];

  if (user.role === "STUDENT") {
    const result = await pool.query<CourseRow>(
      `
        SELECT
          c.id,
          c.code,
          c.name,
          c.description,
          c.is_active,
          c.created_at,
          c.updated_at,
          sc.status AS enrollment_status,
          sc.enrolled_at
        FROM student_courses sc
        JOIN courses c ON c.id = sc.course_id
        WHERE sc.student_user_id = $1
          AND sc.status = 'ACTIVE'
        ORDER BY sc.enrolled_at DESC, lower(c.name) ASC
      `,
      [user.id]
    );
    return result.rows;
  }

  if (user.role === "LECTURER") {
    const result = await pool.query<CourseRow>(
      `
        SELECT
          c.id,
          c.code,
          c.name,
          c.description,
          c.is_active,
          c.created_at,
          c.updated_at,
          NULL::text AS enrollment_status,
          NULL::timestamptz AS enrolled_at
        FROM courses c
        JOIN faculty_modules fm ON fm.course_id = c.id
        JOIN lecturer_module_assignments lma ON lma.module_id = fm.id
        WHERE lma.lecturer_id = $1
        GROUP BY c.id, c.code, c.name, c.description, c.is_active, c.created_at, c.updated_at
        ORDER BY c.is_active DESC, lower(c.name) ASC
      `,
      [user.id]
    );
    return result.rows;
  }

  const result = await pool.query<CourseRow>(
    `
      SELECT
        c.id,
        c.code,
        c.name,
        c.description,
        c.is_active,
        c.created_at,
        c.updated_at,
        NULL::text AS enrollment_status,
        NULL::timestamptz AS enrolled_at
      FROM courses c
      ORDER BY c.is_active DESC, lower(c.name) ASC
    `
  );
  return result.rows;
}

export const courseRouter = Router();

courseRouter.get(
  "/courses",
  requireAccess({ roles: ["ADMIN", "LECTURER", "STUDENT"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const user = req.user!;
      const courses = await getCourseRowsForUser(user);
      if (courses.length === 0) {
        return res.json({ value: [], count: 0 });
      }

      const courseIds = courses.map((course) => course.id);

      const moduleParams: unknown[] = [courseIds];
      let moduleStudentProjection = `NULL::boolean AS is_student_linked`;
      let moduleJoin = "";
      let moduleWhere = "";

      if (user.role === "STUDENT") {
        moduleParams.push(user.id);
        moduleStudentProjection = `
          EXISTS (
            SELECT 1
            FROM student_module_enrollments sme3
            WHERE sme3.module_id = fm.id
              AND sme3.student_id = $2
          ) AS is_student_linked
        `;
      } else if (user.role === "LECTURER") {
        moduleParams.push(user.id);
        moduleJoin = `
          JOIN lecturer_module_assignments visible_lma
            ON visible_lma.module_id = fm.id
           AND visible_lma.lecturer_id = $2
        `;
      }

      const moduleRows = await pool.query<CourseModuleRow>(
        `
          SELECT
            fm.id,
            fm.course_id,
            fm.code,
            fm.name,
            f.name AS faculty_name,
            COUNT(DISTINCT sc_count.student_user_id)::int AS enrolled_count,
            COALESCE(
              json_agg(
                DISTINCT jsonb_build_object(
                  'id', lu.id,
                  'email', lu.email
                )
              ) FILTER (WHERE lu.id IS NOT NULL),
              '[]'::json
            ) AS lecturers,
            ${moduleStudentProjection}
          FROM faculty_modules fm
          JOIN faculties f ON f.id = fm.faculty_id
          ${moduleJoin}
          LEFT JOIN student_module_enrollments sme ON sme.module_id = fm.id
          LEFT JOIN student_courses sc_count
            ON sc_count.student_user_id = sme.student_id
           AND sc_count.course_id = fm.course_id
           AND sc_count.status = 'ACTIVE'
          LEFT JOIN lecturer_module_assignments lma ON lma.module_id = fm.id
          LEFT JOIN users lu ON lu.id = lma.lecturer_id
          WHERE fm.course_id = ANY($1::uuid[])
          ${moduleWhere}
          GROUP BY fm.id, fm.course_id, fm.code, fm.name, f.name
          ORDER BY fm.code ASC
        `,
        moduleParams
      );

      const studentCountRows = await pool.query<{ course_id: string; student_count: number }>(
        `
          SELECT course_id, COUNT(*)::int AS student_count
          FROM student_courses
          WHERE course_id = ANY($1::uuid[])
            AND status = 'ACTIVE'
          GROUP BY course_id
        `,
        [courseIds]
      );

      const studentsByCourse = new Map<string, Array<{
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        studentNumber: string | null;
        status: string;
        enrolledAt: string;
      }>>();

      if (user.role === "ADMIN") {
        const studentRows = await pool.query<CourseStudentRow>(
          `
            SELECT
              sc.course_id,
              sc.student_user_id,
              u.email,
              u.first_name,
              u.last_name,
              u.public_student_id,
              sc.status,
              sc.enrolled_at
            FROM student_courses sc
            JOIN users u ON u.id = sc.student_user_id
            WHERE sc.course_id = ANY($1::uuid[])
              AND sc.status = 'ACTIVE'
            ORDER BY lower(u.email) ASC
          `,
          [courseIds]
        );

        for (const row of studentRows.rows) {
          const list = studentsByCourse.get(row.course_id) ?? [];
          list.push({
            id: row.student_user_id,
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            studentNumber: row.public_student_id,
            status: row.status,
            enrolledAt: row.enrolled_at,
          });
          studentsByCourse.set(row.course_id, list);
        }
      }

      const modulesByCourse = new Map<string, Array<{
        id: string;
        code: string;
        name: string;
        facultyName: string;
        enrolledCount: number;
        lecturers: Array<{ id: string; email: string }>;
        isStudentLinked: boolean;
      }>>();

      for (const row of moduleRows.rows) {
        const list = modulesByCourse.get(row.course_id) ?? [];
        list.push({
          id: row.id,
          code: row.code,
          name: row.name,
          facultyName: row.faculty_name,
          enrolledCount: Number(row.enrolled_count ?? 0),
          lecturers: parseLecturers(row.lecturers),
          isStudentLinked: Boolean(row.is_student_linked),
        });
        modulesByCourse.set(row.course_id, list);
      }

      const studentCountByCourse = new Map(
        studentCountRows.rows.map((row) => [row.course_id, Number(row.student_count ?? 0)])
      );

      const value = courses.map((course) => {
        const modules = modulesByCourse.get(course.id) ?? [];
        const students = studentsByCourse.get(course.id) ?? [];
        const lecturerIds = new Set(
          modules.flatMap((module) => module.lecturers.map((lecturer) => lecturer.id))
        );

        return {
          id: course.id,
          code: course.code,
          name: course.name,
          description: course.description,
          isActive: Boolean(course.is_active),
          createdAt: course.created_at,
          updatedAt: course.updated_at,
          enrollmentStatus: course.enrollment_status,
          enrolledAt: course.enrolled_at,
          summary: {
            moduleCount: modules.length,
            studentCount: studentCountByCourse.get(course.id) ?? 0,
            lecturerCount: lecturerIds.size,
            linkedModuleCount:
              user.role === "STUDENT"
                ? modules.filter((module) => module.isStudentLinked).length
                : modules.length,
          },
          modules,
          students,
        };
      });

      return res.json({ value, count: value.length });
    } catch (e) {
      console.error("[courses] GET /courses error", e);
      return err(res, 500, "INTERNAL", "Failed to load courses");
    }
  }
);

courseRouter.post(
  "/courses",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const code = String(req.body?.code ?? "").trim().toUpperCase();
      const name = String(req.body?.name ?? "").trim();
      const descriptionRaw = String(req.body?.description ?? "").trim();

      if (!code) return err(res, 400, "VALIDATION", "code is required");
      if (!name) return err(res, 400, "VALIDATION", "name is required");

      const created = await pool.query<CourseRow>(
        `
          INSERT INTO courses (code, name, description)
          VALUES ($1, $2, $3)
          RETURNING id, code, name, description, is_active, created_at, updated_at, NULL::text AS enrollment_status, NULL::timestamptz AS enrolled_at
        `,
        [code, name, descriptionRaw || null]
      );

      const row = created.rows[0];
      return res.status(201).json({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    } catch (e: unknown) {
      if (String((e as { code?: string })?.code ?? "") === "23505") {
        return err(res, 400, "VALIDATION", "Course code already exists");
      }
      console.error("[courses] POST /courses error", e);
      return err(res, 500, "INTERNAL", "Failed to create course");
    }
  }
);

courseRouter.patch(
  "/courses/:id",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const courseId = String(req.params.id ?? "").trim();
      if (!isUuid(courseId)) return err(res, 400, "VALIDATION", "id must be a UUID");

      const updates: string[] = [];
      const params: unknown[] = [];

      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "code")) {
        const code = String(req.body?.code ?? "").trim().toUpperCase();
        if (!code) return err(res, 400, "VALIDATION", "code is required");
        params.push(code);
        updates.push(`code = $${params.length}`);
      }

      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "name")) {
        const name = String(req.body?.name ?? "").trim();
        if (!name) return err(res, 400, "VALIDATION", "name is required");
        params.push(name);
        updates.push(`name = $${params.length}`);
      }

      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "description")) {
        const description = String(req.body?.description ?? "").trim();
        params.push(description || null);
        updates.push(`description = $${params.length}`);
      }

      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "isActive")) {
        const isActive = toBool(req.body?.isActive);
        if (isActive === null) return err(res, 400, "VALIDATION", "isActive must be boolean");
        params.push(isActive);
        updates.push(`is_active = $${params.length}`);
      }

      if (updates.length === 0) {
        return err(res, 400, "VALIDATION", "At least one editable field is required");
      }

      params.push(courseId);

      const updated = await pool.query<CourseRow>(
        `
          UPDATE courses
          SET
            ${updates.join(", ")},
            updated_at = now()
          WHERE id = $${params.length}
          RETURNING id, code, name, description, is_active, created_at, updated_at, NULL::text AS enrollment_status, NULL::timestamptz AS enrolled_at
        `,
        params
      );

      if ((updated.rowCount ?? 0) === 0) {
        return err(res, 404, "NOT_FOUND", "Course not found");
      }

      await syncCourseStudentNames(pool, courseId);

      const row = updated.rows[0];
      return res.json({
        ok: true,
        course: {
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          isActive: Boolean(row.is_active),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    } catch (e: unknown) {
      if (String((e as { code?: string })?.code ?? "") === "23505") {
        return err(res, 400, "VALIDATION", "Course code already exists");
      }
      console.error("[courses] PATCH /courses/:id error", e);
      return err(res, 500, "INTERNAL", "Failed to update course");
    }
  }
);

courseRouter.post(
  "/courses/:id/modules",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const courseId = String(req.params.id ?? "").trim();
      const moduleId = String(req.body?.moduleId ?? "").trim();

      if (!isUuid(courseId)) return err(res, 400, "VALIDATION", "id must be a UUID");
      if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");

      const courseRes = await pool.query(`SELECT 1 FROM courses WHERE id = $1 LIMIT 1`, [courseId]);
      if ((courseRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Course not found");

      const moduleRes = await pool.query(`SELECT 1 FROM faculty_modules WHERE id = $1 LIMIT 1`, [moduleId]);
      if ((moduleRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Module not found");

      await pool.query(
        `
          UPDATE faculty_modules
          SET course_id = $1
          WHERE id = $2
        `,
        [courseId, moduleId]
      );

      const linkedStudents = await pool.query<{ student_id: string }>(
        `
          SELECT student_id
          FROM student_module_enrollments
          WHERE module_id = $1
        `,
        [moduleId]
      );

      if (linkedStudents.rows.length > 0) {
        await pool.query(
          `
            INSERT INTO student_courses (student_user_id, course_id, status, enrolled_at)
            SELECT student_id, $1, 'ACTIVE', now()
            FROM student_module_enrollments
            WHERE module_id = $2
            ON CONFLICT (student_user_id, course_id)
            DO UPDATE SET
              status = 'ACTIVE',
              enrolled_at = CASE
                WHEN student_courses.status = 'ACTIVE' THEN student_courses.enrolled_at
                ELSE now()
              END
          `,
          [courseId, moduleId]
        );
      }

      await syncStudentCourseNames(
        pool,
        linkedStudents.rows.map((row) => row.student_id)
      );

      return res.json({ ok: true });
    } catch (e) {
      console.error("[courses] POST /courses/:id/modules error", e);
      return err(res, 500, "INTERNAL", "Failed to assign module to course");
    }
  }
);

courseRouter.delete(
  "/courses/:id/modules/:moduleId",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    const courseId = String(req.params.id ?? "").trim();
    const moduleId = String(req.params.moduleId ?? "").trim();

    if (!isUuid(courseId)) return err(res, 400, "VALIDATION", "id must be a UUID");
    if (!isUuid(moduleId)) return err(res, 400, "VALIDATION", "moduleId must be a UUID");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const courseRes = await client.query(`SELECT 1 FROM courses WHERE id = $1 LIMIT 1`, [
        courseId,
      ]);
      if ((courseRes.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return err(res, 404, "NOT_FOUND", "Course not found");
      }

      const moduleRes = await client.query<{ id: string; code: string; name: string }>(
        `
          SELECT id, code, name
          FROM faculty_modules
          WHERE id = $1
            AND course_id = $2
          LIMIT 1
          FOR UPDATE
        `,
        [moduleId, courseId]
      );

      if ((moduleRes.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return err(res, 404, "NOT_FOUND", "Module not found for this course");
      }

      const dependencyRes = await client.query<ModuleDeleteDependencyCounts>(
        `
          SELECT
            (SELECT COUNT(*)::int FROM lecturer_module_assignments WHERE module_id = $1) AS lecturer_assignment_count,
            (SELECT COUNT(*)::int FROM student_module_enrollments WHERE module_id = $1) AS student_enrollment_count,
            (SELECT COUNT(*)::int FROM attendance_sessions WHERE module_id = $1) AS attendance_session_count,
            (SELECT COUNT(*)::int FROM assessment_results WHERE module_id = $1) AS assessment_result_count,
            (SELECT COUNT(*)::int FROM uploads WHERE module_id = $1) AS upload_count,
            (SELECT COUNT(*)::int FROM announcements WHERE module_id = $1) AS announcement_count
        `,
        [moduleId]
      );

      const blockers = buildModuleDeleteBlockers(dependencyRes.rows[0]);
      if (blockers.length > 0) {
        await client.query("ROLLBACK");
        return err(
          res,
          409,
          "MODULE_IN_USE",
          `Module cannot be removed because it still has ${blockers.join(
            ", "
          )}. Remove those linked records first.`
        );
      }

      await client.query(
        `
          DELETE FROM faculty_modules
          WHERE id = $1
            AND course_id = $2
        `,
        [moduleId, courseId]
      );

      await client.query("COMMIT");
      return res.json({
        ok: true,
        moduleId,
        code: moduleRes.rows[0].code,
        name: moduleRes.rows[0].name,
      });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // no-op: rollback attempt after a failed delete flow
      }
      console.error("[courses] DELETE /courses/:id/modules/:moduleId error", e);
      return err(res, 500, "INTERNAL", "Failed to remove module");
    } finally {
      client.release();
    }
  }
);

courseRouter.post(
  "/courses/:id/enrollments",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const courseId = String(req.params.id ?? "").trim();
      const studentId = String(req.body?.studentId ?? "").trim();
      const status = normalizeStatus(req.body?.status) ?? "ACTIVE";

      if (!isUuid(courseId)) return err(res, 400, "VALIDATION", "id must be a UUID");
      if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

      const courseRes = await pool.query(`SELECT 1 FROM courses WHERE id = $1 LIMIT 1`, [courseId]);
      if ((courseRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Course not found");

      const studentRes = await pool.query(
        `
          SELECT 1
          FROM users
          WHERE id = $1
            AND role = 'STUDENT'
          LIMIT 1
        `,
        [studentId]
      );
      if ((studentRes.rowCount ?? 0) === 0) return err(res, 404, "NOT_FOUND", "Student not found");

      await pool.query(
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
        [studentId, courseId, status]
      );

      await syncStudentCourseName(pool, studentId);

      return res.json({ ok: true });
    } catch (e) {
      console.error("[courses] POST /courses/:id/enrollments error", e);
      return err(res, 500, "INTERNAL", "Failed to enroll student in course");
    }
  }
);

courseRouter.delete(
  "/courses/:id/enrollments/:studentId",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const courseId = String(req.params.id ?? "").trim();
      const studentId = String(req.params.studentId ?? "").trim();

      if (!isUuid(courseId)) return err(res, 400, "VALIDATION", "id must be a UUID");
      if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "studentId must be a UUID");

      const updated = await pool.query(
        `
          UPDATE student_courses
          SET status = 'INACTIVE'
          WHERE student_user_id = $1
            AND course_id = $2
            AND status = 'ACTIVE'
        `,
        [studentId, courseId]
      );

      if ((updated.rowCount ?? 0) === 0) {
        return err(res, 404, "NOT_FOUND", "Course enrollment not found");
      }

      await syncStudentCourseName(pool, studentId);

      return res.json({ ok: true });
    } catch (e) {
      console.error("[courses] DELETE /courses/:id/enrollments/:studentId error", e);
      return err(res, 500, "INTERNAL", "Failed to remove student from course");
    }
  }
);
