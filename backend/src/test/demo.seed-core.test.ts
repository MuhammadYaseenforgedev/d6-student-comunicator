import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

const app = createApp();

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Demo core seed endpoint", () => {
  const previousDemoSeedFlag = process.env.DEMO_SEED_ENABLED;
  let adminToken = "";
  let studentToken = "";

  const CHANNEL_IDS = [
    "10000000-0000-4000-8000-000000000010",
    "10000000-0000-4000-8000-000000000011",
    "10000000-0000-4000-8000-000000000012",
    "10000000-0000-4000-8000-000000000013",
    "10000000-0000-4000-8000-000000000014",
  ];
  const ANNOUNCEMENT_IDS = [
    "10000000-0000-4000-8000-000000000015",
    "10000000-0000-4000-8000-000000000016",
    "10000000-0000-4000-8000-000000000017",
  ];
  const EVENT_IDS = [
    "10000000-0000-4000-8000-000000000018",
    "10000000-0000-4000-8000-000000000019",
  ];
  const THREAD_IDS = [
    "10000000-0000-4000-8000-000000000021",
    "10000000-0000-4000-8000-000000000022",
    "10000000-0000-4000-8000-000000000023",
  ];
  const CALENDAR_IDS = [
    "10000000-0000-4000-8000-000000000031",
    "10000000-0000-4000-8000-000000000032",
  ];
  const MESSAGE_IDS = [
    "10000000-0000-4000-8000-000000000041",
    "10000000-0000-4000-8000-000000000042",
    "10000000-0000-4000-8000-000000000043",
    "10000000-0000-4000-8000-000000000044",
    "10000000-0000-4000-8000-000000000045",
    "10000000-0000-4000-8000-000000000046",
  ];
  const UPLOAD_ID = "10000000-0000-4000-8000-000000000051";
  const RESULT_IDS = [
    "10000000-0000-4000-8000-000000000061",
    "10000000-0000-4000-8000-000000000062",
  ];
  const FINANCE_TRANSACTION_IDS = [
    "10000000-0000-4000-8000-000000000071",
    "10000000-0000-4000-8000-000000000072",
  ];
  const FINANCE_DOCUMENT_IDS = ["10000000-0000-4000-8000-000000000073"];
  const FINANCE_NOTIFICATION_IDS = ["10000000-0000-4000-8000-000000000074"];
  const LINK_REQUEST_ID = "10000000-0000-4000-8000-000000000024";
  const DEMO_EMAILS = [
    "muhammadyaseenw2+student@gmail.com",
    "muhammadyaseenw2+lecturer@gmail.com",
    "muhammadyaseenw2+admin@gmail.com",
    "muhammadyaseenw2+parent@gmail.com",
  ];

  beforeAll(async () => {
    const admin = await createUser("ADMIN");
    const student = await createUser("STUDENT");
    adminToken = signJwt(admin);
    studentToken = signJwt(student);
  });

  afterAll(async () => {
    if (typeof previousDemoSeedFlag === "string") process.env.DEMO_SEED_ENABLED = previousDemoSeedFlag;
    else delete process.env.DEMO_SEED_ENABLED;

    await pool.query(`DELETE FROM attendance_records WHERE session_id IN (SELECT id FROM attendance_sessions WHERE module_id IN (SELECT id FROM faculty_modules WHERE code = 'DEMO-CS101'))`);
    await pool.query(`DELETE FROM attendance_sessions WHERE module_id IN (SELECT id FROM faculty_modules WHERE code = 'DEMO-CS101')`);
    await pool.query(`DELETE FROM student_module_enrollments WHERE module_id IN (SELECT id FROM faculty_modules WHERE code = 'DEMO-CS101')`);
    await pool.query(`DELETE FROM lecturer_module_assignments WHERE module_id IN (SELECT id FROM faculty_modules WHERE code = 'DEMO-CS101')`);
    await pool.query(`DELETE FROM faculty_modules WHERE code = 'DEMO-CS101'`);
    await pool.query(`DELETE FROM faculties WHERE name = 'Demo Faculty'`);
    await pool.query(`DELETE FROM finance_notifications WHERE id = ANY($1::uuid[])`, [FINANCE_NOTIFICATION_IDS]);
    await pool.query(`DELETE FROM finance_documents WHERE id = ANY($1::uuid[])`, [FINANCE_DOCUMENT_IDS]);
    await pool.query(`DELETE FROM finance_transactions WHERE id = ANY($1::uuid[])`, [FINANCE_TRANSACTION_IDS]);
    await pool.query(`DELETE FROM finance_accounts WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`, [DEMO_EMAILS]);
    await pool.query(`DELETE FROM assessment_results WHERE id = ANY($1::uuid[])`, [RESULT_IDS]);
    await pool.query(`DELETE FROM parent_link_requests WHERE id = $1::uuid`, [LINK_REQUEST_ID]);
    await pool.query(`DELETE FROM parent_links WHERE parent_user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`, [DEMO_EMAILS]);
    await pool.query(`DELETE FROM uploads WHERE id = $1::uuid`, [UPLOAD_ID]);
    await pool.query(`DELETE FROM calendar_entries WHERE id = ANY($1::uuid[])`, [CALENDAR_IDS]);
    await pool.query(`DELETE FROM events WHERE id = ANY($1::uuid[])`, [EVENT_IDS]);
    await pool.query(`DELETE FROM announcements WHERE id = ANY($1::uuid[])`, [ANNOUNCEMENT_IDS]);
    await pool.query(`DELETE FROM thread_messages WHERE id = ANY($1::uuid[])`, [MESSAGE_IDS]);
    await pool.query(`DELETE FROM threads WHERE id = ANY($1::uuid[])`, [THREAD_IDS]);
    await pool.query(`DELETE FROM channels WHERE id = ANY($1::uuid[])`, [CHANNEL_IDS]);
    await pool.query(`DELETE FROM users WHERE email = ANY($1::text[])`, [DEMO_EMAILS]);
    await cleanupTestUsers();
  });

  test("returns 404 when DEMO_SEED_ENABLED is not true", async () => {
    delete process.env.DEMO_SEED_ENABLED;

    const res = await request(app).post("/api/demo/seed-core").set(auth(adminToken)).send({});
    expect(res.status).toBe(404);
  });

  test("returns 403 for non-admin", async () => {
    process.env.DEMO_SEED_ENABLED = "true";

    const res = await request(app).post("/api/demo/seed-core").set(auth(studentToken)).send({});
    expect(res.status).toBe(403);
  });

  test("returns 200 for admin with flag enabled", async () => {
    process.env.DEMO_SEED_ENABLED = "true";

    const res = await request(app).post("/api/demo/seed-core").set(auth(adminToken)).send({});
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.channels?.ids)).toBe(true);
    expect(Array.isArray(res.body?.announcements?.ids)).toBe(true);
    expect(Array.isArray(res.body?.events?.ids)).toBe(true);
    expect(Array.isArray(res.body?.threads?.ids)).toBe(true);
    expect(Array.isArray(res.body?.messages?.ids)).toBe(true);
    expect(Array.isArray(res.body?.calendarEntries?.ids)).toBe(true);
    expect(Array.isArray(res.body?.uploads?.ids)).toBe(true);

    const seededStudent = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      ["muhammadyaseenw2+student@gmail.com"]
    );
    const seededParent = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      ["muhammadyaseenw2+parent@gmail.com"]
    );

    expect(seededStudent.rowCount).toBe(1);
    expect(seededParent.rowCount).toBe(1);

    const linkRes = await pool.query(
      `
        SELECT 1
        FROM parent_links
        WHERE parent_user_id = $1 AND student_user_id = $2
        LIMIT 1
      `,
      [seededParent.rows[0].id, seededStudent.rows[0].id]
    );
    expect(linkRes.rowCount).toBe(1);

    const resultsRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM assessment_results WHERE id = ANY($1::uuid[])`,
      [RESULT_IDS]
    );
    expect(resultsRes.rows[0]?.count).toBe(RESULT_IDS.length);

    const financeDocsRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM finance_documents WHERE id = ANY($1::uuid[])`,
      [FINANCE_DOCUMENT_IDS]
    );
    expect(financeDocsRes.rows[0]?.count).toBe(FINANCE_DOCUMENT_IDS.length);

    const financeNotificationsRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM finance_notifications WHERE id = ANY($1::uuid[])`,
      [FINANCE_NOTIFICATION_IDS]
    );
    expect(financeNotificationsRes.rows[0]?.count).toBe(FINANCE_NOTIFICATION_IDS.length);

    const attendanceRes = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM attendance_sessions s
        JOIN faculty_modules m ON m.id = s.module_id
        WHERE m.code = 'DEMO-CS101'
      `
    );
    expect(attendanceRes.rows[0]?.count).toBeGreaterThan(0);
  });
});
