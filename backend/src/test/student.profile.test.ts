import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

const app = createApp();
jest.setTimeout(30000);

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Student profile management and scoped lookup", () => {
  const unique = `test_student_profile_${Date.now()}`;
  let studentId = "";
  let lecturerId = "";
  let adminToken = "";
  let lecturerToken = "";
  let studentToken = "";
  let courseId = "";
  let moduleId = "";
  let autoLinkedModuleId = "";
  let facultyId = "";

  beforeAll(async () => {
    const admin = await createUser("ADMIN", `${unique}_admin@co.za`, "Passw0rd!", "ACADEMIC");
    const lecturer = await createUser("LECTURER", `${unique}_lecturer@co.za`);
    const student = await createUser("STUDENT", `${unique}_student@co.za`);

    adminToken = signJwt(admin);
    lecturerToken = signJwt(lecturer);
    studentToken = signJwt(student);
    lecturerId = lecturer.id;
    studentId = student.id;

    const courseRes = await pool.query<{ id: string }>(
      `
        INSERT INTO courses (code, name, description, is_active)
        VALUES ($1, $2, $3, true)
        RETURNING id
      `,
      [`${unique.toUpperCase()}_COURSE`, `${unique} Course`, "Student profile test course"]
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
      [facultyId, courseId, `${unique.toUpperCase()}_MOD`, `${unique} Module`]
    );
    moduleId = moduleRes.rows[0].id;

    const autoLinkedModuleRes = await pool.query<{ id: string }>(
      `
        INSERT INTO faculty_modules (faculty_id, course_id, code, name)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [facultyId, courseId, `${unique.toUpperCase()}_AUTO`, `${unique} Auto-linked Module`]
    );
    autoLinkedModuleId = autoLinkedModuleRes.rows[0].id;

    await pool.query(
      `
        INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, lecturer_id) DO NOTHING
      `,
      [moduleId, lecturerId]
    );

    await pool.query(
      `
        INSERT INTO student_courses (student_user_id, course_id, status, enrolled_at)
        VALUES ($1, $2, 'ACTIVE', now())
        ON CONFLICT (student_user_id, course_id)
        DO UPDATE SET status = 'ACTIVE', enrolled_at = now()
      `,
      [studentId, courseId]
    );

    await pool.query(
      `
        INSERT INTO student_module_enrollments (module_id, student_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, student_id) DO NOTHING
      `,
      [moduleId, studentId]
    );
  });

  afterAll(async () => {
    const moduleIds = [moduleId, autoLinkedModuleId].filter(Boolean);
    if (moduleIds.length > 0) {
      await pool.query(`DELETE FROM student_module_enrollments WHERE module_id = ANY($1::uuid[])`, [moduleIds]);
      await pool.query(`DELETE FROM lecturer_module_assignments WHERE module_id = ANY($1::uuid[])`, [moduleIds]);
      await pool.query(`DELETE FROM faculty_modules WHERE id = ANY($1::uuid[])`, [moduleIds]);
    }
    if (facultyId) {
      await pool.query(`DELETE FROM faculties WHERE id = $1`, [facultyId]);
    }
    if (courseId) {
      await pool.query(`DELETE FROM student_courses WHERE course_id = $1`, [courseId]);
      await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    }
    await cleanupTestUsers();
  });

  test("student can save a complete profile and admin or lecturer can find it by ID number", async () => {
    const idNumber = `920101${String(Date.now()).slice(-7)}`;

    const saveRes = await request(app)
      .put("/api/student/profile")
      .set(auth(studentToken))
      .send({
        fullName: "Demo Student",
        surname: "Scoped",
        studentNumber: `${unique.toUpperCase()}_1001`,
        idNumber,
        dateOfBirth: "2001-05-12",
        mobileNumber: "0820000001",
        alternativeContactNumber: "0820000002",
        streetAddress: "1 Demo Street",
        city: "Johannesburg",
        province: "Gauteng",
        postalCode: "2000",
        emergencyContactName: "Guardian Demo",
        emergencyContactNumber: "0820000003",
        courseId,
      });

    expect(saveRes.status).toBe(200);
    expect(Boolean(saveRes.body?.profile?.isComplete)).toBe(true);
    expect(String(saveRes.body?.profile?.courseId ?? "")).toBe(courseId);

    const linkedModules = await pool.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM student_module_enrollments
        WHERE student_id = $1
          AND module_id = ANY($2::uuid[])
      `,
      [studentId, [moduleId, autoLinkedModuleId]]
    );
    expect(Number(linkedModules.rows[0]?.c ?? "0")).toBe(2);

    const adminList = await request(app)
      .get("/api/students")
      .set(auth(adminToken))
      .query({ q: idNumber });

    expect(adminList.status).toBe(200);
    expect(Array.isArray(adminList.body?.value)).toBe(true);
    expect(
      adminList.body.value.some((row: { userId?: string }) => row.userId === studentId)
    ).toBe(true);

    const lecturerList = await request(app)
      .get("/api/students")
      .set(auth(lecturerToken))
      .query({ q: idNumber, courseId });

    expect(lecturerList.status).toBe(200);
    expect(
      lecturerList.body.value.some((row: { userId?: string }) => row.userId === studentId)
    ).toBe(true);

    const lecturerDetail = await request(app)
      .get(`/api/students/${studentId}`)
      .set(auth(lecturerToken));

    expect(lecturerDetail.status).toBe(200);
    expect(String(lecturerDetail.body?.profile?.idNumber ?? "")).toBe(idNumber);
    expect(String(lecturerDetail.body?.profile?.feeStatus ?? "")).toBe("");

    const parent = await createUser("PARENT", `${unique}_parent@co.za`);
    const parentToken = signJwt(parent);

    const forbidden = await request(app)
      .get(`/api/students/${studentId}`)
      .set(auth(parentToken));

    expect([401, 403]).toContain(forbidden.status);
  });
});
