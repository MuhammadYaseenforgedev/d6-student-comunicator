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

function csvValue(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvLine(values: string[]): string {
  return values.map(csvValue).join(",");
}

describe("approved learner import foundation", () => {
  const unique = `test_import_foundation_${Date.now()}`;
  let academicToken = "";
  let financeToken = "";
  let studentToken = "";
  let parentToken = "";
  let courseId = "";
  let facultyId = "";
  let moduleId = "";

  beforeAll(async () => {
    const academicAdmin = await createUser("ADMIN", `${unique}_academic@co.za`, "Passw0rd!", "ACADEMIC");
    const financeAdmin = await createUser("ADMIN", `${unique}_finance@co.za`, "Passw0rd!", "FINANCE");
    const student = await createUser("STUDENT", `${unique}_student@co.za`);
    const parent = await createUser("PARENT", `${unique}_parent@co.za`);

    academicToken = signJwt(academicAdmin);
    financeToken = signJwt(financeAdmin);
    studentToken = signJwt(student);
    parentToken = signJwt(parent);

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
    expect(String(res.body?.summary?.studentNumber ?? "")).toMatch(/^FA-\d{8}$/);

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
    expect(String(row.public_student_id ?? "")).toMatch(/^FA-\d{8}$/);
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

  test("student and parent roles cannot trigger approved learner import routes", async () => {
    const body = {
      first_name: "Blocked",
      last_name: "Import",
      email: `${unique}_blocked_student_parent@co.za`,
      external_source_id: `${unique}-blocked-student-parent`,
    };
    const csv = "first_name,last_name,email,external_source_id\nBlocked,Import,test_blocked_role_csv@co.za,blocked-role-csv\n";

    for (const token of [studentToken, parentToken]) {
      const singleRes = await request(app)
        .post("/api/admin/imports/approved-learner")
        .set(auth(token))
        .send(body);
      const csvRes = await request(app)
        .post("/api/admin/imports/approved-learners/csv")
        .set(auth(token))
        .send({ csv });

      expect(singleRes.status).toBe(403);
      expect(csvRes.status).toBe(403);
    }
  });

  test("academic admin can upload CSV learners and repeated imports do not duplicate users", async () => {
    const learnerEmail = `${unique}_csv_created@co.za`;
    const externalSourceId = `${unique}-csv-created`;
    const header = csvLine([
      "first_name",
      "last_name",
      "email",
      "phone",
      "id_number",
      "external_source_id",
      "course_id",
      "metadata_json",
    ]);
    const row = csvLine([
      "Csv",
      "Learner",
      learnerEmail,
      "0820003001",
      "9901011234083",
      externalSourceId,
      courseId,
      JSON.stringify({ cohort: "CSV Intake" }),
    ]);
    const csv = `${header}\n${row}\n`;

    const firstRes = await request(app)
      .post("/api/admin/imports/approved-learners/csv")
      .set(auth(academicToken))
      .attach("file", Buffer.from(csv), {
        filename: "approved-learners.csv",
        contentType: "text/csv",
      });

    expect(firstRes.status).toBe(200);
    expect(Number(firstRes.body?.summary?.totalRows ?? "0")).toBe(1);
    expect(Number(firstRes.body?.summary?.createdCount ?? "0")).toBe(1);
    expect(String(firstRes.body?.results?.[0]?.outcome ?? "")).toBe("CREATED");
    expect(String(firstRes.body?.results?.[0]?.studentNumber ?? "")).toMatch(/^FA-\d{8}$/);

    const firstUserId = String(firstRes.body?.results?.[0]?.userId ?? "");

    const secondRes = await request(app)
      .post("/api/admin/imports/approved-learners/csv")
      .set(auth(academicToken))
      .attach("file", Buffer.from(csv), {
        filename: "approved-learners.csv",
        contentType: "text/csv",
      });

    expect(secondRes.status).toBe(200);
    expect(Number(secondRes.body?.summary?.createdCount ?? "0")).toBe(0);
    expect(Number(secondRes.body?.summary?.updatedCount ?? "0")).toBe(1);
    expect(String(secondRes.body?.results?.[0]?.outcome ?? "")).toBe("UPDATED");
    expect(String(secondRes.body?.results?.[0]?.userId ?? "")).toBe(firstUserId);

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
              AND sp.external_source = 'FORGE_TALENT_CSV'
              AND sp.external_source_id = $2
          ) AS profile_count,
          (
            SELECT COUNT(*)::text
            FROM student_courses sc
            JOIN users u ON u.id = sc.student_user_id
            WHERE lower(u.email) = lower($1)
              AND sc.course_id = $3
          ) AS course_count
      `,
      [learnerEmail, externalSourceId, courseId]
    );

    expect(Number(counts.rows[0]?.user_count ?? "0")).toBe(1);
    expect(Number(counts.rows[0]?.profile_count ?? "0")).toBe(1);
    expect(Number(counts.rows[0]?.course_count ?? "0")).toBe(1);
  });

  test("CSV import reports partial success with row-level failures and skipped rows", async () => {
    const validEmail = `${unique}_csv_partial_valid@co.za`;
    const header = csvLine([
      "first_name",
      "last_name",
      "email",
      "id_number",
      "external_source_id",
      "metadata_json",
    ]);
    const csv = [
      header,
      csvLine([
        "Partial",
        "Valid",
        validEmail,
        "9901011234084",
        `${unique}-csv-partial-valid`,
        JSON.stringify({ source: "partial-test" }),
      ]),
      csvLine([
        "Partial",
        "Invalid Email",
        "not-an-email",
        "9901011234085",
        `${unique}-csv-partial-invalid-email`,
        "",
      ]),
      csvLine([
        "Partial",
        "Invalid Metadata",
        `${unique}_csv_bad_metadata@co.za`,
        "9901011234086",
        `${unique}-csv-partial-bad-metadata`,
        "{not-json",
      ]),
      csvLine(["", "", "", "", "", ""]),
    ].join("\n");

    const res = await request(app)
      .post("/api/admin/imports/approved-learners/csv")
      .set(auth(academicToken))
      .send({ csv });

    expect(res.status).toBe(200);
    expect(Number(res.body?.summary?.totalRows ?? "0")).toBe(4);
    expect(Number(res.body?.summary?.createdCount ?? "0")).toBe(1);
    expect(Number(res.body?.summary?.failedCount ?? "0")).toBe(2);
    expect(Number(res.body?.summary?.skippedCount ?? "0")).toBe(1);
    expect(
      res.body.results.some(
        (row: { outcome?: string; email?: string }) =>
          row.outcome === "CREATED" && row.email === validEmail
      )
    ).toBe(true);
    expect(
      res.body.results.some(
        (row: { outcome?: string; message?: string }) =>
          row.outcome === "FAILED" && String(row.message ?? "").includes("email is invalid")
      )
    ).toBe(true);
    expect(
      res.body.results.some(
        (row: { outcome?: string; message?: string }) =>
          row.outcome === "FAILED" && String(row.message ?? "").includes("metadata_json")
      )
    ).toBe(true);
    expect(
      res.body.results.some(
        (row: { outcome?: string; message?: string }) =>
          row.outcome === "SKIPPED" && String(row.message ?? "").includes("Blank row")
      )
    ).toBe(true);
  });

  test("finance admin cannot trigger the approved learner CSV import route", async () => {
    const res = await request(app)
      .post("/api/admin/imports/approved-learners/csv")
      .set(auth(financeToken))
      .send({
        csv: "first_name,last_name,email,external_source_id\nBlocked,Import,test_blocked_csv@co.za,blocked-csv\n",
      });

    expect(res.status).toBe(403);
  });
});
