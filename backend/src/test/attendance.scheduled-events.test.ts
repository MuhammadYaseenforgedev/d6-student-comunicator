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

describe("scheduled course-event attendance foundation", () => {
  const unique = `test_scheduled_attendance_${Date.now()}`;
  const ctx = {
    adminToken: "",
    studentToken: "",
    lecturerToken: "",
    studentIds: [] as string[],
    lecturerId: "",
    courseId: crypto.randomUUID(),
    facultyId: crypto.randomUUID(),
    moduleId: crypto.randomUUID(),
    templateId: "",
    firstCalendarEntryId: "",
    secondCalendarEntryId: "",
    sessionId: "",
  };

  beforeAll(async () => {
    const admin = await createUser("ADMIN", `${unique}_admin@co.za`, "Passw0rd!", "ACADEMIC");
    const lecturer = await createUser("LECTURER", `${unique}_lecturer@co.za`);
    const students = await Promise.all([
      createUser("STUDENT", `${unique}_student_1@co.za`),
      createUser("STUDENT", `${unique}_student_2@co.za`),
      createUser("STUDENT", `${unique}_student_3@co.za`),
    ]);

    ctx.adminToken = signJwt(admin);
    ctx.lecturerToken = signJwt(lecturer);
    ctx.studentToken = signJwt(students[0]);
    ctx.lecturerId = lecturer.id;
    ctx.studentIds = students.map((student) => student.id);

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
        "Scheduled attendance course",
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

    await pool.query(
      `
        INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
        VALUES ($1, $2)
      `,
      [ctx.moduleId, ctx.lecturerId]
    );

    const template = await pool.query<{ id: string }>(
      `
        INSERT INTO course_schedule_templates (
          course_id,
          module_id,
          title,
          starts_at,
          ends_at,
          reminder_minutes_before,
          sync_metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          '2099-06-01T08:00:00.000Z'::timestamptz,
          '2099-06-01T09:00:00.000Z'::timestamptz,
          15,
          $4::jsonb
        )
        RETURNING id
      `,
      [
        ctx.courseId,
        ctx.moduleId,
        `${unique} Scheduled Lesson`,
        JSON.stringify({ attendanceReady: true }),
      ]
    );
    ctx.templateId = template.rows[0].id;

    for (const studentId of ctx.studentIds) {
      const res = await request(app)
        .post(`/api/courses/${ctx.courseId}/enrollments`)
        .set(auth(ctx.adminToken))
        .send({ studentId });
      expect(res.status).toBe(200);
    }

    const calendarEntries = await pool.query<{ user_id: string; id: string }>(
      `
        SELECT user_id, id
        FROM calendar_entries
        WHERE course_schedule_template_id = $1
          AND user_id = ANY($2::uuid[])
          AND event_source = 'COURSE_SYNC'
        ORDER BY user_id ASC
      `,
      [ctx.templateId, ctx.studentIds]
    );

    expect(calendarEntries.rowCount).toBe(3);
    ctx.firstCalendarEntryId =
      calendarEntries.rows.find((row) => row.user_id === ctx.studentIds[0])?.id ?? "";
    ctx.secondCalendarEntryId =
      calendarEntries.rows.find((row) => row.user_id === ctx.studentIds[1])?.id ?? "";
    expect(ctx.firstCalendarEntryId).toBeTruthy();
    expect(ctx.secondCalendarEntryId).toBeTruthy();
  });

  afterAll(async () => {
    if (ctx.courseId) {
      await pool.query(`DELETE FROM calendar_entries WHERE course_id = $1`, [ctx.courseId]);
      await pool.query(`DELETE FROM course_schedule_templates WHERE course_id = $1`, [ctx.courseId]);
      await pool.query(`DELETE FROM student_courses WHERE course_id = $1`, [ctx.courseId]);
    }
    if (ctx.moduleId) {
      await pool.query(`DELETE FROM student_module_enrollments WHERE module_id = $1`, [ctx.moduleId]);
      await pool.query(`DELETE FROM lecturer_module_assignments WHERE module_id = $1`, [ctx.moduleId]);
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

  test("attendance session can be created from a course-linked calendar entry and seeds enrolled learners", async () => {
    const denied = await request(app)
      .post("/api/attendance/sessions")
      .set(auth(ctx.studentToken))
      .send({ calendarEntryId: ctx.firstCalendarEntryId });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/attendance/sessions")
      .set(auth(ctx.lecturerToken))
      .send({
        calendarEntryId: ctx.firstCalendarEntryId,
        latenessThresholdMinutes: 10,
      });

    expect(created.status).toBe(201);
    expect(String(created.body?.session?.calendarEntryId ?? "")).toBe(ctx.firstCalendarEntryId);
    expect(String(created.body?.session?.courseScheduleTemplateId ?? "")).toBe(ctx.templateId);
    expect(String(created.body?.session?.sessionSource ?? "")).toBe("CALENDAR_EVENT");
    expect(Number(created.body?.seededCount ?? 0)).toBe(3);
    ctx.sessionId = String(created.body?.session?.id ?? "");
    expect(ctx.sessionId).toBeTruthy();

    const records = await pool.query<{ status: string }>(
      `
        SELECT status
        FROM attendance_records
        WHERE session_id = $1
        ORDER BY student_id ASC
      `,
      [ctx.sessionId]
    );

    expect(records.rows.map((row) => row.status)).toEqual(["PENDING", "PENDING", "PENDING"]);
  });

  test("duplicate session creation for the same schedule source is safely idempotent", async () => {
    const repeated = await request(app)
      .post("/api/attendance/sessions")
      .set(auth(ctx.lecturerToken))
      .send({
        calendarEntryId: ctx.secondCalendarEntryId,
        latenessThresholdMinutes: 10,
      });

    expect(repeated.status).toBe(200);
    expect(String(repeated.body?.session?.id ?? "")).toBe(ctx.sessionId);
    expect(Boolean(repeated.body?.session?.created)).toBe(false);

    const count = await pool.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM attendance_sessions
        WHERE course_schedule_template_id = $1
      `,
      [ctx.templateId]
    );
    expect(Number(count.rows[0]?.c ?? "0")).toBe(1);
  });

  test("timing-aware marks infer present and late statuses", async () => {
    const mark = await request(app)
      .post(`/api/attendance/sessions/${ctx.sessionId}/mark`)
      .set(auth(ctx.lecturerToken))
      .send({
        marks: [
          {
            studentId: ctx.studentIds[0],
            markedAt: "2099-06-01T08:05:00.000Z",
          },
          {
            studentId: ctx.studentIds[1],
            markedAt: "2099-06-01T08:15:00.000Z",
          },
        ],
      });

    expect(mark.status).toBe(200);
    expect(mark.body?.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentId: ctx.studentIds[0], status: "PRESENT" }),
        expect.objectContaining({ studentId: ctx.studentIds[1], status: "LATE" }),
      ])
    );
  });

  test("finalization marks remaining pending learners absent and blocks later student actions", async () => {
    const finalized = await request(app)
      .post(`/api/attendance/sessions/${ctx.sessionId}/finalize`)
      .set(auth(ctx.lecturerToken))
      .send({});

    expect(finalized.status).toBe(200);
    expect(Number(finalized.body?.absentCount ?? 0)).toBe(1);
    expect(finalized.body?.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentId: ctx.studentIds[2], status: "ABSENT" }),
      ])
    );

    const statuses = await pool.query<{ student_id: string; status: string }>(
      `
        SELECT student_id, status
        FROM attendance_records
        WHERE session_id = $1
      `,
      [ctx.sessionId]
    );
    const byStudent = new Map(statuses.rows.map((row) => [row.student_id, row.status]));
    expect(byStudent.get(ctx.studentIds[0])).toBe("PRESENT");
    expect(byStudent.get(ctx.studentIds[1])).toBe("LATE");
    expect(byStudent.get(ctx.studentIds[2])).toBe("ABSENT");

    const studentCheckin = await request(app)
      .post(`/api/attendance/sessions/${ctx.sessionId}/check-in`)
      .set(auth(ctx.studentToken))
      .send({});
    expect(studentCheckin.status).toBe(400);
  });

  test("staff attendance visibility supports summaries, record filtering, and session CSV export", async () => {
    const listed = await request(app)
      .get(
        `/api/attendance/sessions?moduleId=${ctx.moduleId}&sessionStatus=FINALIZED&limit=10`
      )
      .set(auth(ctx.lecturerToken));

    expect(listed.status).toBe(200);
    const listedSession = listed.body?.value?.find((row: any) => row.id === ctx.sessionId);
    expect(listedSession).toEqual(
      expect.objectContaining({
        id: ctx.sessionId,
        moduleId: ctx.moduleId,
        courseId: ctx.courseId,
        calendarEntryId: ctx.firstCalendarEntryId,
        finalizedAt: expect.any(String),
      })
    );
    expect(listedSession?.summary).toEqual(
      expect.objectContaining({
        total: 3,
        present: 1,
        late: 1,
        absent: 1,
        pending: 0,
      })
    );

    const detail = await request(app)
      .get(`/api/attendance/sessions/${ctx.sessionId}`)
      .set(auth(ctx.lecturerToken));

    expect(detail.status).toBe(200);
    expect(detail.body?.session?.summary).toEqual(
      expect.objectContaining({
        total: 3,
        present: 1,
        late: 1,
        absent: 1,
        pending: 0,
      })
    );

    const lateRecords = await request(app)
      .get(`/api/attendance/sessions/${ctx.sessionId}/records?status=LATE&q=student_2`)
      .set(auth(ctx.lecturerToken));

    expect(lateRecords.status).toBe(200);
    expect(lateRecords.body?.count).toBe(1);
    expect(lateRecords.body?.value?.[0]).toEqual(
      expect.objectContaining({
        learnerUserId: ctx.studentIds[1],
        status: "LATE",
        learner: expect.objectContaining({
          email: `${unique}_student_2@co.za`,
        }),
      })
    );

    const exported = await request(app)
      .get(`/api/attendance/sessions/${ctx.sessionId}/export.csv`)
      .set(auth(ctx.lecturerToken));

    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toContain("text/csv");
    expect(exported.text).toContain(
      "session_id,course,module,learner_name,learner_email,public_student_id,status,marked_at,status_reason,session_start,session_end"
    );
    expect(exported.text).toContain(`${unique}_student_1@co.za`);
    expect(exported.text).toContain("PRESENT");
    expect(exported.text).toContain("LATE");
    expect(exported.text).toContain("ABSENT");

    const studentDetail = await request(app)
      .get(`/api/attendance/sessions/${ctx.sessionId}`)
      .set(auth(ctx.studentToken));
    expect(studentDetail.status).toBe(403);

    const studentExport = await request(app)
      .get(`/api/attendance/sessions/${ctx.sessionId}/export.csv`)
      .set(auth(ctx.studentToken));
    expect(studentExport.status).toBe(403);
  });
});
