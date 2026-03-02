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
    "10000000-0000-4000-8000-000000000011",
    "10000000-0000-4000-8000-000000000012",
    "10000000-0000-4000-8000-000000000013",
    "10000000-0000-4000-8000-000000000014",
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

    await pool.query(`DELETE FROM uploads WHERE id = $1::uuid`, [UPLOAD_ID]);
    await pool.query(`DELETE FROM calendar_entries WHERE id = ANY($1::uuid[])`, [CALENDAR_IDS]);
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
    expect(Array.isArray(res.body?.threads?.ids)).toBe(true);
    expect(Array.isArray(res.body?.messages?.ids)).toBe(true);
    expect(Array.isArray(res.body?.calendarEntries?.ids)).toBe(true);
    expect(Array.isArray(res.body?.uploads?.ids)).toBe(true);
  });
});
