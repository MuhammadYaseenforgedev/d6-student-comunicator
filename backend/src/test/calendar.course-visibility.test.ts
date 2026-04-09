import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

const app = createApp();
jest.setTimeout(30000);

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function hasEntry(body: any, id: string): boolean {
  return Array.isArray(body?.value) && body.value.some((row: { id?: string }) => row.id === id);
}

describe("Course-scoped calendar visibility", () => {
  const unique = `test_calendar_course_${Date.now()}`;
  let lecturerId = "";
  let lecturerToken = "";
  let studentInCourseId = "";
  let studentInCourseToken = "";
  let studentOutsideCourseToken = "";
  let courseAId = "";
  let courseBId = "";
  let facultyId = "";
  let moduleAId = "";
  let moduleBId = "";
  let courseEntryId = "";

  beforeAll(async () => {
    const lecturer = await createUser("LECTURER", `${unique}_lecturer@co.za`);
    const studentA = await createUser("STUDENT", `${unique}_student_a@co.za`);
    const studentB = await createUser("STUDENT", `${unique}_student_b@co.za`);

    lecturerId = lecturer.id;
    lecturerToken = signJwt(lecturer);
    studentInCourseId = studentA.id;
    studentInCourseToken = signJwt(studentA);
    studentOutsideCourseToken = signJwt(studentB);

    const courses = await pool.query<{ id: string; code: string }>(
      `
        INSERT INTO courses (code, name, description, is_active)
        VALUES
          ($1, $2, $3, true),
          ($4, $5, $6, true)
        RETURNING id, code
      `,
      [
        `${unique.toUpperCase()}_COURSE_A`,
        `${unique} Course A`,
        "Calendar visibility course A",
        `${unique.toUpperCase()}_COURSE_B`,
        `${unique} Course B`,
        "Calendar visibility course B",
      ]
    );

    courseAId = courses.rows.find((row) => row.code.endsWith("COURSE_A"))?.id ?? "";
    courseBId = courses.rows.find((row) => row.code.endsWith("COURSE_B"))?.id ?? "";

    const facultyRes = await pool.query<{ id: string }>(
      `
        INSERT INTO faculties (name)
        VALUES ($1)
        RETURNING id
      `,
      [`${unique} Faculty`]
    );
    facultyId = facultyRes.rows[0].id;

    const modules = await pool.query<{ id: string; code: string }>(
      `
        INSERT INTO faculty_modules (faculty_id, course_id, code, name)
        VALUES
          ($1, $2, $3, $4),
          ($1, $5, $6, $7)
        RETURNING id, code
      `,
      [
        facultyId,
        courseAId,
        `${unique.toUpperCase()}_MOD_A`,
        `${unique} Module A`,
        courseBId,
        `${unique.toUpperCase()}_MOD_B`,
        `${unique} Module B`,
      ]
    );

    moduleAId = modules.rows.find((row) => row.code.endsWith("MOD_A"))?.id ?? "";
    moduleBId = modules.rows.find((row) => row.code.endsWith("MOD_B"))?.id ?? "";

    await pool.query(
      `
        INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, lecturer_id) DO NOTHING
      `,
      [moduleAId, lecturerId]
    );

    await pool.query(
      `
        INSERT INTO student_courses (student_user_id, course_id, status, enrolled_at)
        VALUES
          ($1, $2, 'ACTIVE', now()),
          ($3, $4, 'ACTIVE', now())
        ON CONFLICT (student_user_id, course_id)
        DO UPDATE SET status = 'ACTIVE', enrolled_at = now()
      `,
      [studentA.id, courseAId, studentB.id, courseBId]
    );

    await pool.query(
      `
        INSERT INTO student_module_enrollments (module_id, student_id)
        VALUES
          ($1, $2),
          ($3, $4)
        ON CONFLICT (module_id, student_id) DO NOTHING
      `,
      [moduleAId, studentA.id, moduleBId, studentB.id]
    );
  });

  afterAll(async () => {
    if (courseEntryId) {
      await pool.query(`DELETE FROM calendar_entries WHERE id = $1`, [courseEntryId]);
    }
    if (moduleAId || moduleBId) {
      await pool.query(`DELETE FROM student_module_enrollments WHERE module_id = ANY($1::uuid[])`, [[moduleAId, moduleBId].filter(Boolean)]);
      await pool.query(`DELETE FROM lecturer_module_assignments WHERE module_id = ANY($1::uuid[])`, [[moduleAId, moduleBId].filter(Boolean)]);
      await pool.query(`DELETE FROM faculty_modules WHERE id = ANY($1::uuid[])`, [[moduleAId, moduleBId].filter(Boolean)]);
    }
    if (facultyId) {
      await pool.query(`DELETE FROM faculties WHERE id = $1`, [facultyId]);
    }
    if (courseAId || courseBId) {
      await pool.query(`DELETE FROM student_courses WHERE course_id = ANY($1::uuid[])`, [[courseAId, courseBId].filter(Boolean)]);
      await pool.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [[courseAId, courseBId].filter(Boolean)]);
    }
    await cleanupTestUsers();
  });

  test("course-linked calendar entries are visible only to the correct course audience", async () => {
    const createRes = await request(app)
      .post("/api/calendar")
      .set(auth(lecturerToken))
      .send({
        title: `${unique} course event`,
        description: "Course scoped calendar entry",
        startsAt: "2099-04-10T08:00:00.000Z",
        endsAt: "2099-04-10T09:00:00.000Z",
        courseId: courseAId,
      });

    expect(createRes.status).toBe(201);
    courseEntryId = String(createRes.body?.id ?? "");
    expect(courseEntryId).toBeTruthy();

    const lecturerView = await request(app)
      .get("/api/calendar")
      .set(auth(lecturerToken));
    expect(lecturerView.status).toBe(200);
    expect(hasEntry(lecturerView.body, courseEntryId)).toBe(true);

    const enrolledStudentView = await request(app)
      .get("/api/calendar")
      .set(auth(studentInCourseToken));
    expect(enrolledStudentView.status).toBe(200);
    expect(hasEntry(enrolledStudentView.body, courseEntryId)).toBe(true);

    const unrelatedStudentView = await request(app)
      .get("/api/calendar")
      .set(auth(studentOutsideCourseToken));
    expect(unrelatedStudentView.status).toBe(200);
    expect(hasEntry(unrelatedStudentView.body, courseEntryId)).toBe(false);
  });
});
