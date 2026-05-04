import crypto from "crypto";
import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

const app = createApp();
jest.setTimeout(30000);

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("course calendar sync foundation", () => {
  const unique = `test_course_calendar_${Date.now()}`;
  const ctx = {
    academicToken: "",
    financeToken: "",
    studentToken: "",
    profileStudentToken: "",
    studentId: "",
    profileStudentId: "",
    courseId: crypto.randomUUID(),
    facultyId: crypto.randomUUID(),
    moduleId: crypto.randomUUID(),
    templateId: "",
    manualEntryId: "",
  };

  beforeAll(async () => {
    const academicAdmin = await createUser("ADMIN", `${unique}_academic@co.za`, "Passw0rd!", "ACADEMIC");
    const financeAdmin = await createUser("ADMIN", `${unique}_finance@co.za`, "Passw0rd!", "FINANCE");
    const student = await createUser("STUDENT", `${unique}_student@co.za`);
    const profileStudent = await createUser("STUDENT", `${unique}_profile_student@co.za`);

    ctx.academicToken = signJwt(academicAdmin);
    ctx.financeToken = signJwt(financeAdmin);
    ctx.studentToken = signJwt(student);
    ctx.profileStudentToken = signJwt(profileStudent);
    ctx.studentId = student.id;
    ctx.profileStudentId = profileStudent.id;

    await pool.query(`INSERT INTO faculties (id, name) VALUES ($1, $2)`, [
      ctx.facultyId,
      `${unique} Faculty`,
    ]);

    await pool.query(
      `
        INSERT INTO courses (id, code, name, description, is_active)
        VALUES ($1, $2, $3, $4, true)
      `,
      [
        ctx.courseId,
        `${unique.toUpperCase()}_COURSE`,
        `${unique} Course`,
        "Course calendar sync foundation test",
      ]
    );

    await pool.query(
      `
        INSERT INTO faculty_modules (id, faculty_id, course_id, code, name)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        ctx.moduleId,
        ctx.facultyId,
        ctx.courseId,
        `${unique.toUpperCase()}_MOD`,
        `${unique} Module`,
      ]
    );
  });

  afterAll(async () => {
    if (ctx.courseId) {
      await pool.query(`DELETE FROM calendar_entries WHERE course_id = $1`, [ctx.courseId]);
      await pool.query(`DELETE FROM course_schedule_templates WHERE course_id = $1`, [ctx.courseId]);
      await pool.query(`DELETE FROM student_courses WHERE course_id = $1`, [ctx.courseId]);
    }
    if (ctx.moduleId) {
      await pool.query(`DELETE FROM student_module_enrollments WHERE module_id = $1`, [ctx.moduleId]);
      await pool.query(`DELETE FROM faculty_modules WHERE id = $1`, [ctx.moduleId]);
    }
    if (ctx.courseId) {
      await pool.query(`DELETE FROM courses WHERE id = $1`, [ctx.courseId]);
    }
    if (ctx.facultyId) {
      await pool.query(`DELETE FROM faculties WHERE id = $1`, [ctx.facultyId]);
    }
    await cleanupTestUsers();
  });

  test("admin can create and list course schedule templates with RBAC protection", async () => {
    for (const token of [ctx.financeToken, ctx.studentToken]) {
      const deniedPost = await request(app)
        .post(`/api/admin/courses/${ctx.courseId}/schedule-templates`)
        .set(auth(token))
        .send({
          title: "Blocked schedule",
          startsAt: "2099-05-01T08:00:00.000Z",
          endsAt: "2099-05-01T09:00:00.000Z",
        });
      expect(deniedPost.status).toBe(403);

      const deniedGet = await request(app)
        .get(`/api/admin/courses/${ctx.courseId}/schedule-templates`)
        .set(auth(token));
      expect(deniedGet.status).toBe(403);
    }

    const createRes = await request(app)
      .post(`/api/admin/courses/${ctx.courseId}/schedule-templates`)
      .set(auth(ctx.academicToken))
      .send({
        title: `${unique} Orientation`,
        description: "Generated from course schedule",
        location: "Room 3A",
        moduleId: ctx.moduleId,
        startsAt: "2099-05-01T08:00:00.000Z",
        endsAt: "2099-05-01T09:00:00.000Z",
        reminderMinutesBefore: 30,
        externalProvider: "MICROSOFT_TEAMS",
        externalEventId: `${unique}-teams-event`,
        syncMetadata: {
          teamsMeetingUrl: "https://teams.example.test/course-orientation",
        },
      });

    expect(createRes.status).toBe(201);
    ctx.templateId = String(createRes.body?.template?.id ?? "");
    expect(ctx.templateId).toBeTruthy();
    expect(createRes.body?.template).toMatchObject({
      courseId: ctx.courseId,
      moduleId: ctx.moduleId,
      title: `${unique} Orientation`,
      reminderMinutesBefore: 30,
      externalProvider: "MICROSOFT_TEAMS",
      externalEventId: `${unique}-teams-event`,
      syncMetadata: {
        teamsMeetingUrl: "https://teams.example.test/course-orientation",
      },
    });

    const listRes = await request(app)
      .get(`/api/admin/courses/${ctx.courseId}/schedule-templates`)
      .set(auth(ctx.academicToken));
    expect(listRes.status).toBe(200);
    expect(
      listRes.body?.value?.some((template: { id?: string }) => template.id === ctx.templateId)
    ).toBe(true);
  });

  test("course enrollment syncs generated calendar entries idempotently and preserves manual entries", async () => {
    const manualRes = await request(app)
      .post("/api/calendar")
      .set(auth(ctx.studentToken))
      .send({
        title: `${unique} manual personal event`,
        startsAt: "2099-05-02T08:00:00.000Z",
        endsAt: "2099-05-02T09:00:00.000Z",
      });
    expect(manualRes.status).toBe(201);
    ctx.manualEntryId = String(manualRes.body?.id ?? "");
    expect(ctx.manualEntryId).toBeTruthy();

    const enrollRes = await request(app)
      .post(`/api/courses/${ctx.courseId}/enrollments`)
      .set(auth(ctx.academicToken))
      .send({ studentId: ctx.studentId });
    expect(enrollRes.status).toBe(200);

    const repeatEnrollRes = await request(app)
      .post(`/api/courses/${ctx.courseId}/enrollments`)
      .set(auth(ctx.academicToken))
      .send({ studentId: ctx.studentId });
    expect(repeatEnrollRes.status).toBe(200);

    const generated = await pool.query<{
      id: string;
      module_id: string | null;
      reminder_minutes_before: number | null;
      external_provider: string | null;
      external_event_id: string | null;
      sync_metadata: { teamsMeetingUrl?: string } | null;
    }>(
      `
        SELECT
          id,
          module_id,
          reminder_minutes_before,
          external_provider,
          external_event_id,
          sync_metadata
        FROM calendar_entries
        WHERE user_id = $1
          AND course_id = $2
          AND course_schedule_template_id = $3
          AND event_source = 'COURSE_SYNC'
      `,
      [ctx.studentId, ctx.courseId, ctx.templateId]
    );

    expect(generated.rowCount).toBe(1);
    expect(generated.rows[0]).toMatchObject({
      module_id: ctx.moduleId,
      reminder_minutes_before: 30,
      external_provider: "MICROSOFT_TEAMS",
      external_event_id: `${unique}-teams-event`,
      sync_metadata: {
        teamsMeetingUrl: "https://teams.example.test/course-orientation",
      },
    });

    const manualStillExists = await pool.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM calendar_entries
        WHERE id = $1
          AND user_id = $2
          AND course_id IS NULL
          AND event_source = 'INTERNAL'
      `,
      [ctx.manualEntryId, ctx.studentId]
    );
    expect(Number(manualStillExists.rows[0]?.c ?? "0")).toBe(1);

    const calendarRes = await request(app).get("/api/calendar").set(auth(ctx.studentToken));
    expect(calendarRes.status).toBe(200);
    const generatedEntry = calendarRes.body?.value?.find(
      (entry: { id?: string }) => entry.id === generated.rows[0].id
    );
    expect(generatedEntry).toMatchObject({
      eventSource: "COURSE_SYNC",
      sourceReferenceId: ctx.templateId,
      reminderMinutesBefore: 30,
      externalProvider: "MICROSOFT_TEAMS",
      canDelete: false,
    });
    expect(
      calendarRes.body?.value?.some((entry: { id?: string }) => entry.id === ctx.manualEntryId)
    ).toBe(true);
  });

  test("student profile course-change path uses the same calendar sync behavior", async () => {
    const profileRes = await request(app)
      .put("/api/student/profile")
      .set(auth(ctx.profileStudentToken))
      .send({ courseId: ctx.courseId });

    expect(profileRes.status).toBe(200);
    expect(Boolean(profileRes.body?.ok)).toBe(true);

    const repeatProfileRes = await request(app)
      .put("/api/student/profile")
      .set(auth(ctx.profileStudentToken))
      .send({ courseId: ctx.courseId });
    expect(repeatProfileRes.status).toBe(200);

    const generated = await pool.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM calendar_entries
        WHERE user_id = $1
          AND course_id = $2
          AND course_schedule_template_id = $3
          AND event_source = 'COURSE_SYNC'
      `,
      [ctx.profileStudentId, ctx.courseId, ctx.templateId]
    );

    expect(Number(generated.rows[0]?.c ?? "0")).toBe(1);
  });
});
