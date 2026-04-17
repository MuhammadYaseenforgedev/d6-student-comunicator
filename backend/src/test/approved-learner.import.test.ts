import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

const app = createApp();
jest.setTimeout(30000);

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

describe("approved learner import foundation", () => {
  const unique = `test_import_foundation_${Date.now()}`;
  let academicToken = "";
  let financeToken = "";
  let courseId = "";
  let facultyId = "";
  let moduleId = "";

  beforeAll(async () => {
    const academicAdmin = await createUser("ADMIN", `${unique}_academic@co.za`, "Passw0rd!", "ACADEMIC");
    const financeAdmin = await createUser("ADMIN", `${unique}_finance@co.za`, "Passw0rd!", "FINANCE");

    academicToken = signJwt(academicAdmin);
    financeToken = signJwt(financeAdmin);

    const courseRes = await pool.query<{ id: string }>(
      `
        INSERT INTO courses (code, name, description, is_active)
        VALUES ($1, $2, $3, true)
        RETURNING id
      `,
      [`${unique.toUpperCase()}_COURSE`, `${unique} Course`, "Approved learner import test course"]
    );
    courseId = courseRes.rows[0].id;

    const facultyRes = await pool.query<{ id: string }>(
      `
        INSERT INTO faculties (name)
        VALUES ($1)
        RETURNING id
      `,
      [`${unique} Faculty`]
    );
    facultyId = facultyRes.rows[0].id;

    const moduleRes = await pool.query<{ id: string }>(
      `
        INSERT INTO faculty_modules (faculty_id, course_id, code, name)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [facultyId, courseId, `${unique.toUpperCase()}_MODULE`, `${unique} Module`]
    );
    moduleId = moduleRes.rows[0].id;
  });

  afterAll(async () => {
    await cleanupTestUsers();

    if (moduleId) {
      await pool.query(`DELETE FROM faculty_modules WHERE id = $1`, [moduleId]);
    }
    if (facultyId) {
      await pool.query(`DELETE FROM faculties WHERE id = $1`, [facultyId]);
    }
    if (courseId) {
      await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    }
  });

  test("academic admin can import an approved learner with trusted metadata and course linking", async () => {
    const learnerEmail = `${unique}_created@co.za`;
    const externalSourceId = `${unique}-talent-created`;

    const res = await request(app)
      .post("/api/admin/imports/approved-learner")
      .set(auth(academicToken))
      .send({
        first_name: "Alicia",
        last_name: "Imported",
        email: learnerEmail,
        phone: "0820001001",
        id_number: "9901011234081",
        course_id: courseId,
        external_source_id: externalSourceId,
        metadata: {
          cohort: "April Intake",
          approvalStage: "approved",
        },
      });

    expect(res.status).toBe(201);
    expect(String(res.body?.summary?.action ?? "")).toBe("created");
    expect(String(res.body?.summary?.matchedBy ?? "")).toBe("created");
    expect(Boolean(res.body?.summary?.courseLinked)).toBe(true);
    expect(String(res.body?.summary?.courseId ?? "")).toBe(courseId);
    expect(String(res.body?.summary?.studentNumber ?? "")).toMatch(/^STU-\d{4}-\d{4}$/);

    const db = await pool.query<{
      id: string;
      role: string;
      first_name: string | null;
      last_name: string | null;
      public_student_id: string | null;
      south_african_id: string | null;
      verified_from_talent: boolean | null;
      external_source: string | null;
      external_source_id: string | null;
      locked_fields: unknown;
      source_metadata: unknown;
    }>(
      `
        SELECT
          u.id,
          u.role,
          u.first_name,
          u.last_name,
          u.public_student_id,
          u.south_african_id,
          sp.verified_from_talent,
          sp.external_source,
          sp.external_source_id,
          sp.locked_fields,
          sp.source_metadata
        FROM users u
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        WHERE lower(u.email) = lower($1)
        LIMIT 1
      `,
      [learnerEmail]
    );

    expect((db.rowCount ?? 0) > 0).toBe(true);
    const row = db.rows[0];
    expect(String(row.role ?? "")).toBe("STUDENT");
    expect(String(row.first_name ?? "")).toBe("Alicia");
    expect(String(row.last_name ?? "")).toBe("Imported");
    expect(String(row.public_student_id ?? "")).toMatch(/^STU-\d{4}-\d{4}$/);
    expect(String(row.south_african_id ?? "")).toBe("9901011234081");
    expect(Boolean(row.verified_from_talent)).toBe(true);
    expect(String(row.external_source ?? "")).toBe("FORGE_TALENT");
    expect(String(row.external_source_id ?? "")).toBe(externalSourceId);
    expect(asStringArray(row.locked_fields)).toEqual(
      expect.arrayContaining(["email", "firstName", "lastName", "phone", "nationalId", "courseId"])
    );
    expect(asRecord(row.source_metadata)?.cohort).toBe("April Intake");

    const enrollment = await pool.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM student_courses
        WHERE student_user_id = $1
          AND course_id = $2
          AND status = 'ACTIVE'
      `,
      [row.id, courseId]
    );
    expect(Number(enrollment.rows[0]?.c ?? "0")).toBe(1);

    const moduleLinks = await pool.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM student_module_enrollments
        WHERE student_id = $1
          AND module_id = $2
      `,
      [row.id, moduleId]
    );
    expect(Number(moduleLinks.rows[0]?.c ?? "0")).toBe(1);
  });

  test("re-importing the same learner updates safely without creating duplicates", async () => {
    const learnerEmail = `${unique}_repeat@co.za`;
    const externalSourceId = `${unique}-talent-repeat`;

    const firstRes = await request(app)
      .post("/api/admin/imports/approved-learner")
      .set(auth(academicToken))
      .send({
        first_name: "Repeat",
        last_name: "Learner",
        email: learnerEmail,
        phone: "0820002001",
        id_number: "9901011234082",
        course_id: courseId,
        external_source_id: externalSourceId,
        metadata: { cohort: "Cycle 1" },
      });

    expect(firstRes.status).toBe(201);
    const firstUserId = String(firstRes.body?.summary?.userId ?? "");
    const firstStudentNumber = String(firstRes.body?.summary?.studentNumber ?? "");

    const secondRes = await request(app)
      .post("/api/admin/imports/approved-learner")
      .set(auth(academicToken))
      .send({
        first_name: "Repeat",
        last_name: "Updated",
        email: learnerEmail,
        phone: "0820002999",
        id_number: "9901011234082",
        course_id: courseId,
        external_source_id: externalSourceId,
        metadata: { cohort: "Cycle 2" },
      });

    expect(secondRes.status).toBe(200);
    expect(String(secondRes.body?.summary?.action ?? "")).toBe("updated");
    expect(String(secondRes.body?.summary?.matchedBy ?? "")).toBe("externalSourceId");
    expect(String(secondRes.body?.summary?.userId ?? "")).toBe(firstUserId);
    expect(String(secondRes.body?.summary?.studentNumber ?? "")).toBe(firstStudentNumber);

    const counts = await pool.query<{
      user_count: string;
      profile_count: string;
      course_count: string;
    }>(
      `
        SELECT
          (SELECT COUNT(*)::text FROM users WHERE lower(email) = lower($1)) AS user_count,
          (
            SELECT COUNT(*)::text
            FROM student_profiles sp
            JOIN users u ON u.id = sp.user_id
            WHERE lower(u.email) = lower($1)
          ) AS profile_count,
          (
            SELECT COUNT(*)::text
            FROM student_courses sc
            JOIN users u ON u.id = sc.student_user_id
            WHERE lower(u.email) = lower($1)
              AND sc.course_id = $2
          ) AS course_count
      `,
      [learnerEmail, courseId]
    );

    expect(Number(counts.rows[0]?.user_count ?? "0")).toBe(1);
    expect(Number(counts.rows[0]?.profile_count ?? "0")).toBe(1);
    expect(Number(counts.rows[0]?.course_count ?? "0")).toBe(1);

    const updatedLearner = await pool.query<{
      last_name: string | null;
      mobile_number: string | null;
      source_metadata: unknown;
    }>(
      `
        SELECT
          u.last_name,
          sp.mobile_number,
          sp.source_metadata
        FROM users u
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        WHERE lower(u.email) = lower($1)
        LIMIT 1
      `,
      [learnerEmail]
    );

    expect(String(updatedLearner.rows[0]?.last_name ?? "")).toBe("Updated");
    expect(String(updatedLearner.rows[0]?.mobile_number ?? "")).toBe("0820002999");
    expect(asRecord(updatedLearner.rows[0]?.source_metadata)?.cohort).toBe("Cycle 2");
  });

  test("finance admin cannot trigger the approved learner import route", async () => {
    const res = await request(app)
      .post("/api/admin/imports/approved-learner")
      .set(auth(financeToken))
      .send({
        first_name: "Blocked",
        last_name: "Import",
        email: `${unique}_blocked@co.za`,
        external_source_id: `${unique}-blocked`,
      });

    expect(res.status).toBe(403);
  });
});
