import crypto from "crypto";
import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

const app = createApp();

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

type Ctx = {
  adminToken: string;
  lecturerToken: string;
  otherLecturerToken: string;
  studentToken: string;
  parentToken: string;
  otherParentToken: string;
  studentId: string;
  otherStudentId: string;
  lecturerId: string;
  moduleId: string;
  facultyId: string;
  sessionId: string;
};

describe("Attendance RBAC + marking", () => {
  const ctx = {} as Ctx;

  beforeAll(async () => {
    const admin = await createUser("ADMIN");
    const lecturer = await createUser("LECTURER");
    const otherLecturer = await createUser("LECTURER");
    const student = await createUser("STUDENT");
    const otherStudent = await createUser("STUDENT");
    const parent = await createUser("PARENT");
    const otherParent = await createUser("PARENT");

    ctx.adminToken = signJwt(admin);
    ctx.lecturerToken = signJwt(lecturer);
    ctx.otherLecturerToken = signJwt(otherLecturer);
    ctx.studentToken = signJwt(student);
    ctx.parentToken = signJwt(parent);
    ctx.otherParentToken = signJwt(otherParent);

    ctx.studentId = student.id;
    ctx.otherStudentId = otherStudent.id;
    ctx.lecturerId = lecturer.id;

    ctx.facultyId = crypto.randomUUID();
    await pool.query(`INSERT INTO faculties (id, name) VALUES ($1, $2)`, [
      ctx.facultyId,
      `Test Faculty ${Date.now()}`,
    ]);

    ctx.moduleId = crypto.randomUUID();
    await pool.query(
      `
        INSERT INTO faculty_modules (id, faculty_id, code, name)
        VALUES ($1, $2, $3, $4)
      `,
      [ctx.moduleId, ctx.facultyId, `TST-${Date.now()}`, "Test Module"]
    );

    await pool.query(
      `
        INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
        VALUES ($1, $2)
      `,
      [ctx.moduleId, lecturer.id]
    );

    await pool.query(
      `
        INSERT INTO student_module_enrollments (module_id, student_id)
        VALUES ($1, $2)
      `,
      [ctx.moduleId, student.id]
    );

    await pool.query(
      `
        INSERT INTO parent_links (parent_user_id, student_user_id)
        VALUES ($1, $2)
      `,
      [parent.id, student.id]
    );

    const seededSession = await pool.query<{ id: string }>(
      `
        INSERT INTO attendance_sessions (lecturer_id, module_id, attendance_date, created_by)
        VALUES ($1, $2, CURRENT_DATE, $1)
        RETURNING id
      `,
      [lecturer.id, ctx.moduleId]
    );
    ctx.sessionId = seededSession.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM faculty_modules WHERE id = $1`, [ctx.moduleId]);
    await pool.query(`DELETE FROM faculties WHERE id = $1`, [ctx.facultyId]);
    await cleanupTestUsers();
  });

  test("assigned lecturer can create attendance session", async () => {
    const res = await request(app)
      .post("/api/attendance/sessions")
      .set(auth(ctx.lecturerToken))
      .send({ moduleId: ctx.moduleId, date: "2026-03-01" });

    expect(res.status).toBe(201);
    expect(String(res.body?.moduleId ?? "")).toBe(ctx.moduleId);
  });

  test("unassigned lecturer cannot create attendance session", async () => {
    const res = await request(app)
      .post("/api/attendance/sessions")
      .set(auth(ctx.otherLecturerToken))
      .send({ moduleId: ctx.moduleId, date: "2026-03-01" });

    expect(res.status).toBe(403);
  });

  test("student cannot create attendance session", async () => {
    const res = await request(app)
      .post("/api/attendance/sessions")
      .set(auth(ctx.studentToken))
      .send({ moduleId: ctx.moduleId, date: "2026-03-01" });

    expect([401, 403]).toContain(res.status);
  });

  test("lecturer can mark enrolled students", async () => {
    const res = await request(app)
      .post(`/api/attendance/sessions/${ctx.sessionId}/mark`)
      .set(auth(ctx.lecturerToken))
      .send([{ studentId: ctx.studentId, status: "PRESENT" }]);

    expect(res.status).toBe(200);
    expect(Number(res.body?.count ?? 0)).toBe(1);
  });

  test("lecturer cannot mark students not enrolled in module", async () => {
    const res = await request(app)
      .post(`/api/attendance/sessions/${ctx.sessionId}/mark`)
      .set(auth(ctx.lecturerToken))
      .send([{ studentId: ctx.otherStudentId, status: "ABSENT" }]);

    expect(res.status).toBe(400);
  });

  test("student can view own attendance", async () => {
    const res = await request(app)
      .get("/api/attendance/me")
      .set(auth(ctx.studentToken))
      .query({ from: "2026-01-01", to: "2026-12-31" });

    expect(res.status).toBe(200);
    expect(Number(res.body?.count ?? 0)).toBeGreaterThanOrEqual(1);
  });

  test("linked parent can view child attendance", async () => {
    const res = await request(app)
      .get("/api/attendance/me")
      .set(auth(ctx.parentToken))
      .query({ childId: ctx.studentId, from: "2026-01-01", to: "2026-12-31" });

    expect(res.status).toBe(200);
    expect(String(res.body?.student?.id ?? "")).toBe(ctx.studentId);
  });

  test("unlinked parent cannot view another child attendance", async () => {
    const res = await request(app)
      .get("/api/attendance/me")
      .set(auth(ctx.otherParentToken))
      .query({ childId: ctx.studentId, from: "2026-01-01", to: "2026-12-31" });

    expect(res.status).toBe(403);
  });
});
