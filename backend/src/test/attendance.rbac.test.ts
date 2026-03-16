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
  strangerLecturerToken: string;
  studentToken: string;
  parentToken: string;
  otherParentToken: string;
  studentId: string;
  otherStudentId: string;
  lecturerId: string;
  otherLecturerId: string;
  strangerLecturerId: string;
  moduleId: string;
  otherModuleId: string;
  facultyId: string;
  facultyName: string;
  sessionId: string;
  checkinSessionId: string;
  otherSessionId: string;
  createdModuleIds: string[];
};

describe("Attendance RBAC + marking", () => {
  const ctx = {} as Ctx;

  beforeAll(async () => {
    const admin = await createUser("ADMIN");
    const lecturer = await createUser("LECTURER");
    const otherLecturer = await createUser("LECTURER");
    const strangerLecturer = await createUser("LECTURER");
    const student = await createUser("STUDENT");
    const otherStudent = await createUser("STUDENT");
    const parent = await createUser("PARENT");
    const otherParent = await createUser("PARENT");

    ctx.adminToken = signJwt(admin);
    ctx.lecturerToken = signJwt(lecturer);
    ctx.otherLecturerToken = signJwt(otherLecturer);
    ctx.strangerLecturerToken = signJwt(strangerLecturer);
    ctx.studentToken = signJwt(student);
    ctx.parentToken = signJwt(parent);
    ctx.otherParentToken = signJwt(otherParent);

    ctx.studentId = student.id;
    ctx.otherStudentId = otherStudent.id;
    ctx.lecturerId = lecturer.id;
    ctx.otherLecturerId = otherLecturer.id;
    ctx.strangerLecturerId = strangerLecturer.id;
    ctx.createdModuleIds = [];

    ctx.facultyId = crypto.randomUUID();
    ctx.facultyName = `Test Faculty ${Date.now()}`;
    await pool.query(`INSERT INTO faculties (id, name) VALUES ($1, $2)`, [
      ctx.facultyId,
      ctx.facultyName,
    ]);

    ctx.moduleId = crypto.randomUUID();
    await pool.query(
      `
        INSERT INTO faculty_modules (id, faculty_id, code, name)
        VALUES ($1, $2, $3, $4)
      `,
      [ctx.moduleId, ctx.facultyId, `TST-${Date.now()}`, "Test Module"]
    );

    ctx.otherModuleId = crypto.randomUUID();
    await pool.query(
      `
        INSERT INTO faculty_modules (id, faculty_id, code, name)
        VALUES ($1, $2, $3, $4)
      `,
      [ctx.otherModuleId, ctx.facultyId, `ALT-${Date.now()}`, "Other Test Module"]
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
        INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
        VALUES ($1, $2)
      `,
      [ctx.otherModuleId, otherLecturer.id]
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

    const checkinSession = await pool.query<{ id: string }>(
      `
        INSERT INTO attendance_sessions (lecturer_id, module_id, attendance_date, created_by)
        VALUES ($1, $2, CURRENT_DATE, $1)
        RETURNING id
      `,
      [lecturer.id, ctx.moduleId]
    );
    ctx.checkinSessionId = checkinSession.rows[0].id;

    const otherSeededSession = await pool.query<{ id: string }>(
      `
        INSERT INTO attendance_sessions (lecturer_id, module_id, attendance_date, created_by)
        VALUES ($1, $2, CURRENT_DATE, $1)
        RETURNING id
      `,
      [otherLecturer.id, ctx.otherModuleId]
    );
    ctx.otherSessionId = otherSeededSession.rows[0].id;
  });

  afterAll(async () => {
    if (ctx.createdModuleIds.length > 0) {
      await pool.query(`DELETE FROM faculty_modules WHERE id = ANY($1::uuid[])`, [ctx.createdModuleIds]);
    }
    await pool.query(`DELETE FROM faculty_modules WHERE id = $1`, [ctx.otherModuleId]);
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

  test("lecturer can create attendance module", async () => {
    const res = await request(app)
      .post("/api/attendance/modules")
      .set(auth(ctx.lecturerToken))
      .send({
        code: `LCT-${Date.now()}`,
        name: "Lecturer Created Module",
        facultyName: ctx.facultyName,
      });

    expect(res.status).toBe(201);
    expect(typeof res.body?.id).toBe("string");
    ctx.createdModuleIds.push(String(res.body.id));
  });

  test("lecturer can create attendance session on a global module and auto-assign self", async () => {
    const res = await request(app)
      .post("/api/attendance/sessions")
      .set(auth(ctx.strangerLecturerToken))
      .send({ moduleId: ctx.moduleId, date: "2026-03-01" });

    expect(res.status).toBe(201);
    expect(String(res.body?.lecturerId ?? "")).toBe(ctx.strangerLecturerId);

    const assignment = await pool.query(
      `
        SELECT 1
        FROM lecturer_module_assignments
        WHERE module_id = $1
          AND lecturer_id = $2
        LIMIT 1
      `,
      [ctx.moduleId, ctx.strangerLecturerId]
    );
    expect(assignment.rowCount ?? 0).toBe(1);
  });

  test("admin can create attendance session for a globally selected lecturer and auto-assign them", async () => {
    const res = await request(app)
      .post("/api/attendance/sessions")
      .set(auth(ctx.adminToken))
      .send({ moduleId: ctx.moduleId, lecturerId: ctx.otherLecturerId, date: "2026-03-02" });

    expect(res.status).toBe(201);
    expect(String(res.body?.lecturerId ?? "")).toBe(ctx.otherLecturerId);

    const assignment = await pool.query(
      `
        SELECT 1
        FROM lecturer_module_assignments
        WHERE module_id = $1
          AND lecturer_id = $2
        LIMIT 1
      `,
      [ctx.moduleId, ctx.otherLecturerId]
    );
    expect(assignment.rowCount ?? 0).toBe(1);
  });

  test("lecturer can list modules globally", async () => {
    const res = await request(app)
      .get("/api/attendance/modules")
      .set(auth(ctx.lecturerToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.value)).toBe(true);
    expect(res.body.value.some((row: { id?: string }) => row.id === ctx.moduleId)).toBe(true);
    expect(res.body.value.some((row: { id?: string }) => row.id === ctx.otherModuleId)).toBe(true);
  });

  test("lecturer can assign and remove lecturers on a global module", async () => {
    const assignRes = await request(app)
      .post(`/api/attendance/modules/${ctx.otherModuleId}/lecturers`)
      .set(auth(ctx.lecturerToken))
      .send({ lecturerId: ctx.strangerLecturerId });

    expect(assignRes.status).toBe(200);
    expect(Boolean(assignRes.body?.ok)).toBe(true);

    const removeRes = await request(app)
      .delete(`/api/attendance/modules/${ctx.otherModuleId}/lecturers/${ctx.strangerLecturerId}`)
      .set(auth(ctx.lecturerToken));

    expect(removeRes.status).toBe(200);
    expect(Boolean(removeRes.body?.ok)).toBe(true);
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

  test("student can list only enrolled modules", async () => {
    const res = await request(app)
      .get("/api/attendance/modules")
      .set(auth(ctx.studentToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.value)).toBe(true);
    expect(res.body.value).toHaveLength(1);
    expect(String(res.body.value[0]?.id ?? "")).toBe(ctx.moduleId);
  });

  test("student can list sessions for enrolled module", async () => {
    const res = await request(app)
      .get("/api/attendance/sessions")
      .set(auth(ctx.studentToken))
      .query({ moduleId: ctx.moduleId });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.value)).toBe(true);
    expect(res.body.value.some((row: { moduleId?: string }) => row.moduleId === ctx.moduleId)).toBe(true);
    expect(res.body.value.some((row: { moduleId?: string }) => row.moduleId === ctx.otherModuleId)).toBe(false);
  });

  test("student can check in to an enrolled attendance session", async () => {
    const res = await request(app)
      .post(`/api/attendance/sessions/${ctx.checkinSessionId}/check-in`)
      .set(auth(ctx.studentToken))
      .send({});

    expect(res.status).toBe(200);
    expect(Boolean(res.body?.ok)).toBe(true);
    expect(typeof res.body?.checkedInAt).toBe("string");
    expect(String(res.body?.suggestedStatus ?? "")).toBe("PRESENT");
  });

  test("student session listing includes recorded check-in time", async () => {
    const res = await request(app)
      .get("/api/attendance/sessions")
      .set(auth(ctx.studentToken))
      .query({ moduleId: ctx.moduleId });

    expect(res.status).toBe(200);
    const row = res.body.value.find((value: { id?: string }) => value.id === ctx.checkinSessionId);
    expect(typeof row?.checkedInAt).toBe("string");
  });

  test("student cannot list sessions for module they are not enrolled in", async () => {
    const res = await request(app)
      .get("/api/attendance/sessions")
      .set(auth(ctx.studentToken))
      .query({ moduleId: ctx.otherModuleId });

    expect(res.status).toBe(403);
  });

  test("student cannot check in to a session for another module", async () => {
    const res = await request(app)
      .post(`/api/attendance/sessions/${ctx.otherSessionId}/check-in`)
      .set(auth(ctx.studentToken))
      .send({});

    expect(res.status).toBe(403);
  });

  test("assigned lecturer can view session roster with check-in data", async () => {
    const res = await request(app)
      .get(`/api/attendance/sessions/${ctx.checkinSessionId}/roster`)
      .set(auth(ctx.lecturerToken));

    expect(res.status).toBe(200);
    const row = res.body.value.find((value: { id?: string }) => value.id === ctx.studentId);
    expect(typeof row?.checkedInAt).toBe("string");
    expect(String(row?.suggestedStatus ?? "")).toBe("PRESENT");
  });

  test("lecturer can view and mark another lecturer's session", async () => {
    await pool.query(
      `
        INSERT INTO student_module_enrollments (module_id, student_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, student_id) DO NOTHING
      `,
      [ctx.otherModuleId, ctx.otherStudentId]
    );

    const rosterRes = await request(app)
      .get(`/api/attendance/sessions/${ctx.otherSessionId}/roster`)
      .set(auth(ctx.lecturerToken));

    expect(rosterRes.status).toBe(200);

    const markRes = await request(app)
      .post(`/api/attendance/sessions/${ctx.otherSessionId}/mark`)
      .set(auth(ctx.lecturerToken))
      .send([{ studentId: ctx.otherStudentId, status: "PRESENT" }]);

    expect(markRes.status).toBe(200);
    expect(Number(markRes.body?.count ?? 0)).toBe(1);
  });

  test("assigned lecturer can enroll and remove students on assigned module", async () => {
    const enrollRes = await request(app)
      .post(`/api/attendance/modules/${ctx.moduleId}/enrollments`)
      .set(auth(ctx.lecturerToken))
      .send({ studentId: ctx.otherStudentId });

    expect(enrollRes.status).toBe(200);
    expect(Boolean(enrollRes.body?.ok)).toBe(true);

    const removeRes = await request(app)
      .delete(`/api/attendance/modules/${ctx.moduleId}/enrollments/${ctx.otherStudentId}`)
      .set(auth(ctx.lecturerToken));

    expect(removeRes.status).toBe(200);
    expect(Boolean(removeRes.body?.ok)).toBe(true);
  });

  test("lecturer can change enrollments on a global module without prior assignment", async () => {
    const enrollRes = await request(app)
      .post(`/api/attendance/modules/${ctx.otherModuleId}/enrollments`)
      .set(auth(ctx.strangerLecturerToken))
      .send({ studentId: ctx.studentId });

    expect(enrollRes.status).toBe(200);
    expect(Boolean(enrollRes.body?.ok)).toBe(true);

    const removeRes = await request(app)
      .delete(`/api/attendance/modules/${ctx.otherModuleId}/enrollments/${ctx.studentId}`)
      .set(auth(ctx.strangerLecturerToken));

    expect(removeRes.status).toBe(200);
    expect(Boolean(removeRes.body?.ok)).toBe(true);
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
