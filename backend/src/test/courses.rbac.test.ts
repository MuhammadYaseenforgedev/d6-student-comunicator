import crypto from "crypto";
import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

const app = createApp();

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Courses RBAC + visibility", () => {
  const ctx = {
    financeAdminToken: "",
    academicAdminToken: "",
    superAdminToken: "",
    lecturerToken: "",
    studentToken: "",
    financeAdminId: "",
    academicAdminId: "",
    superAdminId: "",
    lecturerId: "",
    studentId: "",
    facultyId: "",
    courseId: "",
    moduleId: "",
    removableModuleId: "",
  };

  beforeAll(async () => {
    const financeAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "FINANCE");
    const academicAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "ACADEMIC");
    const superAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "SUPER");
    const lecturer = await createUser("LECTURER");
    const student = await createUser("STUDENT");

    ctx.financeAdminToken = signJwt(financeAdmin);
    ctx.academicAdminToken = signJwt(academicAdmin);
    ctx.superAdminToken = signJwt(superAdmin);
    ctx.lecturerToken = signJwt(lecturer);
    ctx.studentToken = signJwt(student);

    ctx.financeAdminId = financeAdmin.id;
    ctx.academicAdminId = academicAdmin.id;
    ctx.superAdminId = superAdmin.id;
    ctx.lecturerId = lecturer.id;
    ctx.studentId = student.id;

    ctx.facultyId = crypto.randomUUID();
    ctx.courseId = crypto.randomUUID();
    ctx.moduleId = crypto.randomUUID();
    ctx.removableModuleId = crypto.randomUUID();

    await pool.query(`INSERT INTO faculties (id, name) VALUES ($1, $2)`, [
      ctx.facultyId,
      `Course Test Faculty ${Date.now()}`,
    ]);

    await pool.query(
      `
        INSERT INTO courses (id, code, name, description, is_active)
        VALUES ($1, $2, $3, $4, true)
      `,
      [ctx.courseId, `COURSE-RBAC-${Date.now()}`, "RBAC Test Course", "Course visibility regression test"]
    );

    await pool.query(
      `
        INSERT INTO faculty_modules (id, faculty_id, course_id, code, name)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [ctx.moduleId, ctx.facultyId, ctx.courseId, `MOD-RBAC-${Date.now()}`, "RBAC Module"]
    );

    await pool.query(
      `
        INSERT INTO faculty_modules (id, faculty_id, course_id, code, name)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        ctx.removableModuleId,
        ctx.facultyId,
        ctx.courseId,
        `MOD-REMOVE-${Date.now()}`,
        "Removable Module",
      ]
    );

    await pool.query(
      `
        INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
        VALUES ($1, $2)
      `,
      [ctx.moduleId, ctx.lecturerId]
    );

    await pool.query(
      `
        INSERT INTO student_courses (student_user_id, course_id, status, enrolled_at)
        VALUES ($1, $2, 'ACTIVE', now())
      `,
      [ctx.studentId, ctx.courseId]
    );

    await pool.query(
      `
        INSERT INTO student_module_enrollments (module_id, student_id)
        VALUES ($1, $2)
      `,
      [ctx.moduleId, ctx.studentId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM faculty_modules WHERE id = ANY($1::uuid[])`, [
      [ctx.moduleId, ctx.removableModuleId],
    ]);
    await pool.query(`DELETE FROM student_courses WHERE course_id = $1`, [ctx.courseId]);
    await pool.query(`DELETE FROM courses WHERE id = $1`, [ctx.courseId]);
    await pool.query(`DELETE FROM faculties WHERE id = $1`, [ctx.facultyId]);
    await cleanupTestUsers();
  });

  test("finance admin cannot access course management", async () => {
    const res = await request(app).get("/api/courses").set(auth(ctx.financeAdminToken));
    expect([401, 403]).toContain(res.status);
  });

  test("academic admin can create a course", async () => {
    const res = await request(app)
      .post("/api/courses")
      .set(auth(ctx.academicAdminToken))
      .send({
        code: `COURSE-NEW-${Date.now()}`,
        name: "New Academic Course",
        description: "Created by academic admin",
      });

    expect(res.status).toBe(201);
    expect(typeof res.body?.id).toBe("string");

    await pool.query(`DELETE FROM courses WHERE id = $1`, [res.body.id]);
  });

  test("lecturer sees courses represented by taught modules", async () => {
    const res = await request(app).get("/api/courses").set(auth(ctx.lecturerToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.value)).toBe(true);
    expect(res.body.value.some((course: { id?: string }) => course.id === ctx.courseId)).toBe(true);
  });

  test("student sees enrolled course with linked module", async () => {
    const res = await request(app).get("/api/courses").set(auth(ctx.studentToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.value)).toBe(true);
    expect(res.body.value).toHaveLength(1);
    expect(String(res.body.value[0]?.id ?? "")).toBe(ctx.courseId);
    expect(
      Array.isArray(res.body.value[0]?.modules) &&
        res.body.value[0].modules.some((module: { id?: string; isStudentLinked?: boolean }) => {
          return module.id === ctx.moduleId && Boolean(module.isStudentLinked);
        })
    ).toBe(true);
  });

  test("lecturer cannot remove modules from a course", async () => {
    const res = await request(app)
      .delete(`/api/courses/${ctx.courseId}/modules/${ctx.moduleId}`)
      .set(auth(ctx.lecturerToken));

    expect([401, 403]).toContain(res.status);
  });

  test("academic admin cannot remove a module that still has linked memberships", async () => {
    const res = await request(app)
      .delete(`/api/courses/${ctx.courseId}/modules/${ctx.moduleId}`)
      .set(auth(ctx.academicAdminToken));

    expect(res.status).toBe(409);
    expect(String(res.body?.error?.message ?? "")).toMatch(/lecturer assignment/i);
    expect(String(res.body?.error?.message ?? "")).toMatch(/learner enrollment/i);
  });

  test("academic admin can remove an empty module from a course", async () => {
    const res = await request(app)
      .delete(`/api/courses/${ctx.courseId}/modules/${ctx.removableModuleId}`)
      .set(auth(ctx.academicAdminToken));

    expect(res.status).toBe(200);
    expect(Boolean(res.body?.ok)).toBe(true);
    expect(String(res.body?.moduleId ?? "")).toBe(ctx.removableModuleId);

    const lookup = await pool.query(`SELECT 1 FROM faculty_modules WHERE id = $1 LIMIT 1`, [
      ctx.removableModuleId,
    ]);
    expect(lookup.rowCount ?? 0).toBe(0);
  });

  test("super admin can update and archive a course", async () => {
    const res = await request(app)
      .patch(`/api/courses/${ctx.courseId}`)
      .set(auth(ctx.superAdminToken))
      .send({
        description: "Updated by super admin",
        isActive: false,
      });

    expect(res.status).toBe(200);
    expect(Boolean(res.body?.ok)).toBe(true);
    expect(Boolean(res.body?.course?.isActive)).toBe(false);

    await pool.query(`UPDATE courses SET is_active = true WHERE id = $1`, [ctx.courseId]);
  });
});
