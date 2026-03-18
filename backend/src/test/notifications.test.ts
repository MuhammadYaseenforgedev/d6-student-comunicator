import request from "supertest";
import { app } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

type NotificationDto = {
  id: string;
  category: string;
  title: string;
  meta?: Record<string, unknown>;
};

function auth(token: string, spaced = false) {
  return { Authorization: spaced ? `Bearer    ${token}` : `Bearer ${token}` };
}

describe("Notification inbox and auth header parsing", () => {
  const previousThreadsMode = process.env.THREADS_MODE;

  beforeAll(() => {
    process.env.THREADS_MODE = "D6";
  });

  afterAll(async () => {
    process.env.THREADS_MODE = previousThreadsMode;
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
  });
});
