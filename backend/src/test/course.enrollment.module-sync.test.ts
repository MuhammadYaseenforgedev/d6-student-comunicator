import crypto from "crypto";
import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

const app = createApp();

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("course enrollment module sync", () => {
  const ctx = {
    academicAdminToken: "",
    studentId: "",
    facultyId: "",
    courseId: "",
    moduleIds: [] as string[],
    extraModuleId: "",
  };

  beforeAll(async () => {
    const academicAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "ACADEMIC");
    const student = await createUser("STUDENT");

    ctx.academicAdminToken = signJwt(academicAdmin);
    ctx.studentId = student.id;
    ctx.facultyId = crypto.randomUUID();
    ctx.courseId = crypto.randomUUID();
    ctx.moduleIds = Array.from({ length: 5 }, () => crypto.randomUUID());

    await pool.query(`INSERT INTO faculties (id, name) VALUES ($1, $2)`, [
      ctx.facultyId,
      `Course Sync Faculty ${Date.now()}`,
    ]);

    await pool.query(
      `
        INSERT INTO courses (id, code, name, description, is_active)
        VALUES ($1, $2, $3, $4, true)
      `,
      [
        ctx.courseId,
        `COURSE-SYNC-${Date.now()}`,
        "Course Sync Test",
        "Verifies learner module auto-assignment",
      ]
    );

    for (const [index, moduleId] of ctx.moduleIds.entries()) {
      await pool.query(
        `
          INSERT INTO faculty_modules (id, faculty_id, course_id, code, name)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          moduleId,
          ctx.facultyId,
          ctx.courseId,
          `COURSE-SYNC-MOD-${Date.now()}-${index}`,
          `Course Sync Module ${index + 1}`,
        ]
      );
    }
  });

  afterAll(async () => {
    const allModuleIds = ctx.extraModuleId ? [...ctx.moduleIds, ctx.extraModuleId] : [...ctx.moduleIds];
    if (allModuleIds.length > 0) {
      await pool.query(`DELETE FROM student_module_enrollments WHERE module_id = ANY($1::uuid[])`, [allModuleIds]);
      await pool.query(`DELETE FROM faculty_modules WHERE id = ANY($1::uuid[])`, [allModuleIds]);
    }
    if (ctx.courseId) {
      await pool.query(`DELETE FROM student_courses WHERE course_id = $1`, [ctx.courseId]);
      await pool.query(`DELETE FROM courses WHERE id = $1`, [ctx.courseId]);
    }
    if (ctx.facultyId) {
      await pool.query(`DELETE FROM faculties WHERE id = $1`, [ctx.facultyId]);
    }
    await cleanupTestUsers();
  });

  test("enrolling a learner into a course auto-links all existing course modules without duplicates", async () => {
    const enrollRes = await request(app)
      .post(`/api/courses/${ctx.courseId}/enrollments`)
      .set(auth(ctx.academicAdminToken))
      .send({ studentId: ctx.studentId });

    expect(enrollRes.status).toBe(200);
    expect(Boolean(enrollRes.body?.ok)).toBe(true);

    const firstCount = await pool.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM student_module_enrollments
        WHERE student_id = $1
          AND module_id = ANY($2::uuid[])
      `,
      [ctx.studentId, ctx.moduleIds]
    );
    expect(Number(firstCount.rows[0]?.c ?? "0")).toBe(5);

    const repeatRes = await request(app)
      .post(`/api/courses/${ctx.courseId}/enrollments`)
      .set(auth(ctx.academicAdminToken))
      .send({ studentId: ctx.studentId });

    expect(repeatRes.status).toBe(200);
    expect(Boolean(repeatRes.body?.ok)).toBe(true);

    const secondCount = await pool.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM student_module_enrollments
        WHERE student_id = $1
          AND module_id = ANY($2::uuid[])
      `,
      [ctx.studentId, ctx.moduleIds]
    );
    expect(Number(secondCount.rows[0]?.c ?? "0")).toBe(5);
  });

  test("manual module assignment still works after course auto-linking", async () => {
    const enrollRes = await request(app)
      .post(`/api/courses/${ctx.courseId}/enrollments`)
      .set(auth(ctx.academicAdminToken))
      .send({ studentId: ctx.studentId });

    expect(enrollRes.status).toBe(200);

    ctx.extraModuleId = crypto.randomUUID();
    await pool.query(
      `
        INSERT INTO faculty_modules (id, faculty_id, course_id, code, name)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        ctx.extraModuleId,
        ctx.facultyId,
        ctx.courseId,
        `COURSE-SYNC-EXTRA-${Date.now()}`,
        "Course Sync Optional Module",
      ]
    );

    const manualRes = await request(app)
      .post(`/api/attendance/modules/${ctx.extraModuleId}/enrollments`)
      .set(auth(ctx.academicAdminToken))
      .send({ studentId: ctx.studentId });

    expect(manualRes.status).toBe(200);
    expect(Boolean(manualRes.body?.ok)).toBe(true);

    const lookup = await pool.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM student_module_enrollments
        WHERE module_id = $1
          AND student_id = $2
      `,
      [ctx.extraModuleId, ctx.studentId]
    );
    expect(Number(lookup.rows[0]?.c ?? "0")).toBe(1);
  });
});
