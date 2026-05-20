import request from "supertest";
import crypto from "crypto";
import { app } from "../app";
import { pool } from "../config/db";
import { env } from "../config/env";
import { cleanupTestUsers, createChannel, createUser, signJwt } from "./helpers";

type NotificationDto = {
  id: string;
  category: string;
  type: string;
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
};

function auth(token: string, spaced = false) {
  return { Authorization: spaced ? `Bearer    ${token}` : `Bearer ${token}` };
}

async function upsertWhatsAppPreference(userId: string) {
  await pool.query(
    `
      INSERT INTO user_contact_preferences (
        user_id,
        whatsapp_phone_e164,
        whatsapp_enabled,
        whatsapp_opted_in_at,
        whatsapp_opted_out_at,
        source
      )
      VALUES ($1, '+27820000001', true, now(), NULL, 'test')
      ON CONFLICT (user_id) DO UPDATE
      SET
        whatsapp_phone_e164 = EXCLUDED.whatsapp_phone_e164,
        whatsapp_enabled = EXCLUDED.whatsapp_enabled,
        whatsapp_opted_in_at = EXCLUDED.whatsapp_opted_in_at,
        whatsapp_opted_out_at = NULL,
        updated_at = now()
    `,
    [userId]
  );
}

async function listWhatsAppDeliveries(notificationId: string) {
  const result = await pool.query<{
    status: string;
    template_name: string | null;
    provider_message_id: string | null;
    error_code: string | null;
  }>(
    `
      SELECT status, template_name, provider_message_id, error_code
      FROM notification_deliveries
      WHERE notification_id = $1
      ORDER BY created_at ASC
    `,
    [notificationId]
  );
  return result.rows;
}

describe("Notification inbox and auth header parsing", () => {
  const previousThreadsMode = process.env.THREADS_MODE;
  const attendanceSessionIds: string[] = [];
  const moduleIds: string[] = [];
  const courseIds: string[] = [];
  const facultyIds: string[] = [];
  const parentLinkRequestIds: string[] = [];
  const previousWhatsAppConfig = {
    enabled: env.WHATSAPP_ENABLED,
    dryRun: env.WHATSAPP_DRY_RUN,
    provider: env.WHATSAPP_PROVIDER,
    allowedCategories: [...env.WHATSAPP_ALLOWED_CATEGORIES],
  };

  beforeAll(() => {
    process.env.THREADS_MODE = "D6";
    env.WHATSAPP_ENABLED = true;
    env.WHATSAPP_DRY_RUN = true;
    env.WHATSAPP_PROVIDER = "none";
    env.WHATSAPP_ALLOWED_CATEGORIES = ["ANNOUNCEMENT", "EMERGENCY", "ATTENDANCE", "PARENT_LINK"];
  });

  afterAll(async () => {
    process.env.THREADS_MODE = previousThreadsMode;
    env.WHATSAPP_ENABLED = previousWhatsAppConfig.enabled;
    env.WHATSAPP_DRY_RUN = previousWhatsAppConfig.dryRun;
    env.WHATSAPP_PROVIDER = previousWhatsAppConfig.provider;
    env.WHATSAPP_ALLOWED_CATEGORIES = previousWhatsAppConfig.allowedCategories;
    if (attendanceSessionIds.length > 0) {
      await pool.query(`DELETE FROM attendance_records WHERE session_id = ANY($1::uuid[])`, [attendanceSessionIds]);
      await pool.query(`DELETE FROM attendance_sessions WHERE id = ANY($1::uuid[])`, [attendanceSessionIds]);
    }
    if (moduleIds.length > 0) {
      await pool.query(`DELETE FROM student_module_enrollments WHERE module_id = ANY($1::uuid[])`, [moduleIds]);
      await pool.query(`DELETE FROM lecturer_module_assignments WHERE module_id = ANY($1::uuid[])`, [moduleIds]);
      await pool.query(`DELETE FROM faculty_modules WHERE id = ANY($1::uuid[])`, [moduleIds]);
    }
    if (parentLinkRequestIds.length > 0) {
      await pool.query(`DELETE FROM parent_link_requests WHERE id = ANY($1::uuid[])`, [parentLinkRequestIds]);
    }
    if (courseIds.length > 0) {
      await pool.query(`DELETE FROM student_courses WHERE course_id = ANY($1::uuid[])`, [courseIds]);
      await pool.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courseIds]);
    }
    if (facultyIds.length > 0) {
      await pool.query(`DELETE FROM faculties WHERE id = ANY($1::uuid[])`, [facultyIds]);
    }
    await cleanupTestUsers();
  });

  test("accepts bearer headers with extra spaces and creates unread message notifications", async () => {
    const lecturer = await createUser("LECTURER");
    const student = await createUser("STUDENT");

    const lecturerToken = signJwt(lecturer);
    const studentToken = signJwt(student);

    const threadRes = await request(app)
      .post("/api/threads")
      .set(auth(studentToken, true))
      .send({ participantEmails: [lecturer.email] });

    expect([200, 201]).toContain(threadRes.status);
    const threadId = String(threadRes.body?.id ?? "");
    expect(threadId).toBeTruthy();

    const msgRes = await request(app)
      .post(`/api/threads/${threadId}/messages`)
      .set(auth(studentToken, true))
      .send({ body: "hello from student" });

    expect(msgRes.status).toBe(201);

    const summaryRes = await request(app)
      .get("/api/notifications/summary")
      .set(auth(lecturerToken, true));

    expect(summaryRes.status).toBe(200);
    expect(Number(summaryRes.body?.counts?.MESSAGE ?? 0)).toBeGreaterThanOrEqual(1);

    const listRes = await request(app)
      .get("/api/notifications?unreadOnly=true")
      .set(auth(lecturerToken, true));

    expect(listRes.status).toBe(200);
    const items = Array.isArray(listRes.body?.value) ? (listRes.body.value as NotificationDto[]) : [];
    const messageNotification = items.find((item) => item.category === "MESSAGE");
    expect(messageNotification).toBeTruthy();
    expect(messageNotification?.meta?.href).toBe(`/app/messages/${threadId}`);
    expect(await listWhatsAppDeliveries(messageNotification!.id)).toHaveLength(0);

    const markRes = await request(app)
      .post(`/api/notifications/${messageNotification!.id}/read`)
      .set(auth(lecturerToken));

    expect(markRes.status).toBe(200);

    const afterMarkRes = await request(app)
      .get("/api/notifications/summary")
      .set(auth(lecturerToken));

    expect(afterMarkRes.status).toBe(200);
    expect(Number(afterMarkRes.body?.counts?.MESSAGE ?? 0)).toBe(0);
  });

  test("creates parent result notifications and finance alerts", async () => {
    const admin = await createUser("ADMIN");
    const parent = await createUser("PARENT");
    const student = await createUser("STUDENT");

    const adminToken = signJwt(admin);
    const parentToken = signJwt(parent);
    const childId = `STU-${Date.now()}`;

    await pool.query(`UPDATE users SET public_student_id = $2 WHERE id = $1`, [student.id, childId]);
    await pool.query(
      `
        INSERT INTO parent_links (parent_user_id, student_user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [parent.id, student.id]
    );

    const resultRes = await request(app)
      .post("/api/parent/admin/results")
      .set(auth(adminToken))
      .send({
        childId,
        subject: "Mathematics",
        score: 88,
        outOf: 100,
        date: "2026-03-13",
      });

    expect(resultRes.status).toBe(201);

    const resultSummaryRes = await request(app)
      .get("/api/notifications/summary")
      .set(auth(parentToken));

    expect(resultSummaryRes.status).toBe(200);
    expect(Number(resultSummaryRes.body?.counts?.RESULT ?? 0)).toBeGreaterThanOrEqual(1);

    const resultListRes = await request(app)
      .get("/api/notifications?category=RESULT&unreadOnly=true")
      .set(auth(parentToken));
    expect(resultListRes.status).toBe(200);
    const resultItems = Array.isArray(resultListRes.body?.value) ? (resultListRes.body.value as NotificationDto[]) : [];
    const resultNotification = resultItems.find((item) => item.category === "RESULT");
    expect(resultNotification).toBeTruthy();
    expect(await listWhatsAppDeliveries(resultNotification!.id)).toHaveLength(0);

    await pool.query(
      `
        INSERT INTO finance_accounts (user_id, balance_cents, currency, updated_at)
        VALUES ($1, 25000, 'ZAR', now())
        ON CONFLICT (user_id)
        DO UPDATE SET balance_cents = EXCLUDED.balance_cents, currency = EXCLUDED.currency, updated_at = now()
      `,
      [student.id]
    );

    const financeSummaryRes = await request(app)
      .get("/api/notifications/summary")
      .set(auth(parentToken));

    expect(financeSummaryRes.status).toBe(200);
    expect(Number(financeSummaryRes.body?.counts?.FINANCE ?? 0)).toBeGreaterThanOrEqual(1);

    const financeListRes = await request(app)
      .get("/api/notifications?category=FINANCE&unreadOnly=true")
      .set(auth(parentToken));
    expect(financeListRes.status).toBe(200);
    const financeItems = Array.isArray(financeListRes.body?.value) ? (financeListRes.body.value as NotificationDto[]) : [];
    const financeNotification = financeItems.find((item) => item.category === "FINANCE");
    expect(financeNotification).toBeTruthy();
    expect(await listWhatsAppDeliveries(financeNotification!.id)).toHaveLength(0);
  });

  test("creates attendance notifications for marked students and linked parents", async () => {
    const lecturer = await createUser("LECTURER");
    const student = await createUser("STUDENT");
    const parent = await createUser("PARENT");

    const lecturerToken = signJwt(lecturer);
    const studentToken = signJwt(student);
    const parentToken = signJwt(parent);
    await upsertWhatsAppPreference(student.id);
    await upsertWhatsAppPreference(parent.id);

    const facultyId = crypto.randomUUID();
    const courseId = crypto.randomUUID();
    const moduleId = crypto.randomUUID();
    facultyIds.push(facultyId);
    courseIds.push(courseId);
    moduleIds.push(moduleId);

    await pool.query(`INSERT INTO faculties (id, name) VALUES ($1, $2)`, [
      facultyId,
      `Notification Faculty ${Date.now()}`,
    ]);
    await pool.query(
      `
        INSERT INTO courses (id, code, name, description, is_active)
        VALUES ($1, $2, $3, $4, true)
      `,
      [courseId, `NOTIF-${Date.now()}`, "Notification Course", "Notification test course"]
    );
    await pool.query(
      `
        INSERT INTO faculty_modules (id, faculty_id, course_id, code, name)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [moduleId, facultyId, courseId, `NMOD-${Date.now()}`, "Notification Module"]
    );
    await pool.query(
      `INSERT INTO lecturer_module_assignments (module_id, lecturer_id) VALUES ($1, $2)`,
      [moduleId, lecturer.id]
    );
    await pool.query(
      `
        INSERT INTO student_courses (student_user_id, course_id, status, enrolled_at)
        VALUES ($1, $2, 'ACTIVE', now())
      `,
      [student.id, courseId]
    );
    await pool.query(
      `INSERT INTO student_module_enrollments (module_id, student_id) VALUES ($1, $2)`,
      [moduleId, student.id]
    );
    await pool.query(
      `INSERT INTO parent_links (parent_user_id, student_user_id) VALUES ($1, $2)`,
      [parent.id, student.id]
    );

    const sessionRes = await pool.query<{ id: string }>(
      `
        INSERT INTO attendance_sessions (lecturer_id, module_id, attendance_date, created_by)
        VALUES ($1, $2, CURRENT_DATE, $1)
        RETURNING id
      `,
      [lecturer.id, moduleId]
    );
    const sessionId = sessionRes.rows[0].id;
    attendanceSessionIds.push(sessionId);

    const markRes = await request(app)
      .post(`/api/attendance/sessions/${sessionId}/mark`)
      .set(auth(lecturerToken))
      .send([{ studentId: student.id, status: "ABSENT" }]);

    expect(markRes.status).toBe(200);
    expect(Number(markRes.body?.count ?? 0)).toBe(1);

    const studentSummaryRes = await request(app)
      .get("/api/notifications/summary")
      .set(auth(studentToken));
    expect(studentSummaryRes.status).toBe(200);
    expect(Number(studentSummaryRes.body?.counts?.ATTENDANCE ?? 0)).toBeGreaterThanOrEqual(1);

    const parentSummaryRes = await request(app)
      .get("/api/notifications/summary")
      .set(auth(parentToken));
    expect(parentSummaryRes.status).toBe(200);
    expect(Number(parentSummaryRes.body?.counts?.ATTENDANCE ?? 0)).toBeGreaterThanOrEqual(1);

    const studentListRes = await request(app)
      .get("/api/notifications?category=ATTENDANCE&unreadOnly=true")
      .set(auth(studentToken));
    expect(studentListRes.status).toBe(200);
    const studentItems = Array.isArray(studentListRes.body?.value)
      ? (studentListRes.body.value as NotificationDto[])
      : [];
    const studentNotification = studentItems.find(
      (item) => String(item.meta?.sessionId ?? "") === sessionId
    );
    expect(studentNotification).toBeTruthy();
    expect(studentNotification?.category).toBe("ATTENDANCE");
    expect(studentNotification?.type).toBe("ATTENDANCE_MARKED");
    expect(studentNotification?.title).toContain("Attendance marked");
    expect(String(studentNotification?.body ?? "")).toContain("Notification Module");
    expect(studentNotification?.meta?.href).toBe("/app/attendance");
    expect(studentNotification?.meta?.status).toBe("ABSENT");
    const studentAttendanceDeliveries = await listWhatsAppDeliveries(studentNotification!.id);
    expect(studentAttendanceDeliveries).toHaveLength(1);
    expect(studentAttendanceDeliveries[0]).toMatchObject({
      status: "DRY_RUN",
      template_name: "attendance_update",
      error_code: null,
    });
    expect(JSON.stringify(studentAttendanceDeliveries[0])).not.toContain("ABSENT");

    const parentListRes = await request(app)
      .get("/api/notifications?category=ATTENDANCE&unreadOnly=true")
      .set(auth(parentToken));
    expect(parentListRes.status).toBe(200);
    const parentItems = Array.isArray(parentListRes.body?.value)
      ? (parentListRes.body.value as NotificationDto[])
      : [];
    const parentNotification = parentItems.find(
      (item) => String(item.meta?.sessionId ?? "") === sessionId
    );
    expect(parentNotification).toBeTruthy();
    expect(parentNotification?.category).toBe("ATTENDANCE");
    expect(parentNotification?.type).toBe("ATTENDANCE_MARKED");
    expect(parentNotification?.title).toContain("Attendance update");
    expect(String(parentNotification?.body ?? "")).toContain("ABSENT");
    expect(parentNotification?.meta?.href).toBe("/app/parent/attendance");
    const parentAttendanceDeliveries = await listWhatsAppDeliveries(parentNotification!.id);
    expect(parentAttendanceDeliveries).toHaveLength(1);
    expect(parentAttendanceDeliveries[0]).toMatchObject({
      status: "DRY_RUN",
      template_name: "attendance_update",
      error_code: null,
    });
    expect(JSON.stringify(parentAttendanceDeliveries[0])).not.toContain("ABSENT");

    const markReadRes = await request(app)
      .post(`/api/notifications/${studentNotification!.id}/read`)
      .set(auth(studentToken));
    expect(markReadRes.status).toBe(200);

    const afterMarkRes = await request(app)
      .get("/api/notifications/summary")
      .set(auth(studentToken));
    expect(afterMarkRes.status).toBe(200);
    expect(Number(afterMarkRes.body?.counts?.ATTENDANCE ?? 0)).toBe(0);
  });

  test("creates parent-link notifications when requests are approved or rejected", async () => {
    const admin = await createUser("ADMIN", undefined, "Passw0rd!", "ACADEMIC");
    const adminToken = signJwt(admin);

    for (const decision of ["APPROVED", "REJECTED"] as const) {
      const parent = await createUser("PARENT");
      const student = await createUser("STUDENT");
      const parentToken = signJwt(parent);
      const studentToken = signJwt(student);
      await upsertWhatsAppPreference(parent.id);
      const southAfricanId = `${Date.now()}${Math.floor(Math.random() * 1_000_000)
        .toString()
        .padStart(6, "0")}`.slice(-13);
      const publicStudentId = `PL-${decision}-${Date.now()}`;

      await pool.query(
        `
          UPDATE users
          SET south_african_id = $2,
              public_student_id = $3
          WHERE id = $1
        `,
        [student.id, southAfricanId, publicStudentId]
      );

      const requestRes = await request(app)
        .post("/api/parent/parent/link-requests")
        .set(auth(parentToken))
        .send({ southAfricanId });

      expect(requestRes.status).toBe(201);
      const requestId = String(requestRes.body?.id ?? "");
      expect(requestId).toBeTruthy();
      parentLinkRequestIds.push(requestId);

      const decideRes = await request(app)
        .post(`/api/parent/admin/parent/link-requests/${requestId}/decide`)
        .set(auth(adminToken))
        .send({ decision });

      expect(decideRes.status).toBe(200);
      expect(decideRes.body?.status).toBe(decision);

      const parentSummaryRes = await request(app)
        .get("/api/notifications/summary")
        .set(auth(parentToken));
      expect(parentSummaryRes.status).toBe(200);
      expect(Number(parentSummaryRes.body?.counts?.PARENT_LINK ?? 0)).toBe(1);

      const parentListRes = await request(app)
        .get("/api/notifications?category=PARENT_LINK&unreadOnly=true")
        .set(auth(parentToken));
      expect(parentListRes.status).toBe(200);
      const parentItems = Array.isArray(parentListRes.body?.value)
        ? (parentListRes.body.value as NotificationDto[])
        : [];
      const notification = parentItems.find(
        (item) => String(item.meta?.requestId ?? "") === requestId
      );

      expect(notification).toBeTruthy();
      expect(notification?.category).toBe("PARENT_LINK");
      expect(notification?.type).toBe("PARENT_LINK_DECIDED");
      expect(notification?.title).toContain(
        decision === "APPROVED" ? "approved" : "rejected"
      );
      expect(String(notification?.body ?? "")).toContain(publicStudentId);
      expect(notification?.meta?.href).toBe("/app/parent/children");
      expect(notification?.meta?.decision).toBe(decision);
      const parentLinkDeliveries = await listWhatsAppDeliveries(notification!.id);
      expect(parentLinkDeliveries).toHaveLength(1);
      expect(parentLinkDeliveries[0]).toMatchObject({
        status: "DRY_RUN",
        template_name: "parent_link_update",
        error_code: null,
      });

      const studentSummaryRes = await request(app)
        .get("/api/notifications/summary")
        .set(auth(studentToken));
      expect(studentSummaryRes.status).toBe(200);
      expect(Number(studentSummaryRes.body?.counts?.PARENT_LINK ?? 0)).toBe(0);

      const adminSummaryRes = await request(app)
        .get("/api/notifications/summary")
        .set(auth(adminToken));
      expect(adminSummaryRes.status).toBe(200);
      expect(Number(adminSummaryRes.body?.counts?.PARENT_LINK ?? 0)).toBe(0);
    }
  });

  test("removes stale announcement notifications after the source announcement is deleted", async () => {
    const admin = await createUser("ADMIN");
    const lecturer = await createUser("LECTURER");
    const student = await createUser("STUDENT");
    await upsertWhatsAppPreference(student.id);

    const adminToken = signJwt(admin);
    const studentToken = signJwt(student);
    const channelId = await createChannel(lecturer.id, `notice-${Date.now()}`);

    const createRes = await request(app)
      .post(`/api/channels/${channelId}/announcements`)
      .set(auth(adminToken))
      .send({ title: `notice-${Date.now()}`, body: "important notice body" });

    expect(createRes.status).toBe(201);
    const announcementId = String(createRes.body?.id ?? "");
    expect(announcementId).toBeTruthy();

    const beforeRes = await request(app)
      .get("/api/notifications?category=ANNOUNCEMENT")
      .set(auth(studentToken));

    expect(beforeRes.status).toBe(200);
    const beforeItems = Array.isArray(beforeRes.body?.value) ? (beforeRes.body.value as NotificationDto[]) : [];
    expect(
      beforeItems.some((item) => String(item.meta?.announcementId ?? "") === announcementId)
    ).toBe(true);
    const announcementNotification = beforeItems.find(
      (item) => String(item.meta?.announcementId ?? "") === announcementId
    );
    const announcementDeliveries = await listWhatsAppDeliveries(announcementNotification!.id);
    expect(announcementDeliveries).toHaveLength(1);
    expect(announcementDeliveries[0]).toMatchObject({
      status: "DRY_RUN",
      template_name: "announcement_update",
      error_code: null,
    });

    const deleteRes = await request(app)
      .delete(`/api/channels/${channelId}/announcements/${announcementId}`)
      .set(auth(adminToken));

    expect(deleteRes.status).toBe(200);

    const afterRes = await request(app)
      .get("/api/notifications?category=ANNOUNCEMENT")
      .set(auth(studentToken));

    expect(afterRes.status).toBe(200);
    const afterItems = Array.isArray(afterRes.body?.value) ? (afterRes.body.value as NotificationDto[]) : [];
    expect(
      afterItems.some((item) => String(item.meta?.announcementId ?? "") === announcementId)
    ).toBe(false);
  });

  test("creates emergency announcement WhatsApp dry-run delivery with emergency template", async () => {
    const admin = await createUser("ADMIN");
    const lecturer = await createUser("LECTURER");
    const student = await createUser("STUDENT");
    await upsertWhatsAppPreference(student.id);

    const adminToken = signJwt(admin);
    const studentToken = signJwt(student);
    const channelId = await createChannel(lecturer.id, `emergency-${Date.now()}`);
    await pool.query(`UPDATE channels SET type = 'EMERGENCY' WHERE id = $1`, [channelId]);

    const createRes = await request(app)
      .post(`/api/channels/${channelId}/announcements`)
      .set(auth(adminToken))
      .send({ title: `emergency-${Date.now()}`, body: "emergency notice body" });

    expect(createRes.status).toBe(201);
    const announcementId = String(createRes.body?.id ?? "");
    expect(announcementId).toBeTruthy();

    const listRes = await request(app)
      .get("/api/notifications?category=EMERGENCY")
      .set(auth(studentToken));

    expect(listRes.status).toBe(200);
    const items = Array.isArray(listRes.body?.value) ? (listRes.body.value as NotificationDto[]) : [];
    const emergencyNotification = items.find(
      (item) => String(item.meta?.announcementId ?? "") === announcementId
    );
    expect(emergencyNotification).toBeTruthy();
    expect(emergencyNotification?.category).toBe("EMERGENCY");

    const deliveries = await listWhatsAppDeliveries(emergencyNotification!.id);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      status: "DRY_RUN",
      template_name: "emergency_alert",
      error_code: null,
    });
  });

  test("removes announcement notifications after the source announcement expires", async () => {
    const admin = await createUser("ADMIN");
    const lecturer = await createUser("LECTURER");
    const student = await createUser("STUDENT");

    const adminToken = signJwt(admin);
    const studentToken = signJwt(student);
    const channelId = await createChannel(lecturer.id, `expiring-notice-${Date.now()}`);

    const createRes = await request(app)
      .post(`/api/channels/${channelId}/announcements`)
      .set(auth(adminToken))
      .send({
        title: `expiring-${Date.now()}`,
        body: "temporary notice",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

    expect(createRes.status).toBe(201);
    const announcementId = String(createRes.body?.id ?? "");
    expect(announcementId).toBeTruthy();

    const beforeRes = await request(app)
      .get("/api/notifications?category=ANNOUNCEMENT")
      .set(auth(studentToken));

    expect(beforeRes.status).toBe(200);
    const beforeItems = Array.isArray(beforeRes.body?.value) ? (beforeRes.body.value as NotificationDto[]) : [];
    expect(
      beforeItems.some((item) => String(item.meta?.announcementId ?? "") === announcementId)
    ).toBe(true);

    await pool.query(
      `
        UPDATE announcements
        SET expires_at = now() - interval '2 minutes'
        WHERE id = $1
      `,
      [announcementId]
    );

    const afterRes = await request(app)
      .get("/api/notifications?category=ANNOUNCEMENT")
      .set(auth(studentToken));

    expect(afterRes.status).toBe(200);
    const afterItems = Array.isArray(afterRes.body?.value) ? (afterRes.body.value as NotificationDto[]) : [];
    expect(
      afterItems.some((item) => String(item.meta?.announcementId ?? "") === announcementId)
    ).toBe(false);
  });
});
