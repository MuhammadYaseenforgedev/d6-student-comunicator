import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

const app = createApp();

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Demo attendance seed endpoint", () => {
  const previousDemoSeedFlag = process.env.DEMO_SEED_ENABLED;
  let adminToken = "";
  let studentToken = "";

  beforeAll(async () => {
    const admin = await createUser("ADMIN");
    const student = await createUser("STUDENT");
    adminToken = signJwt(admin);
    studentToken = signJwt(student);
  });

  afterAll(async () => {
    if (typeof previousDemoSeedFlag === "string") process.env.DEMO_SEED_ENABLED = previousDemoSeedFlag;
    else delete process.env.DEMO_SEED_ENABLED;

    await pool.query(`DELETE FROM faculty_modules WHERE code = 'DEMO-CS101'`);
    await pool.query(`DELETE FROM faculties WHERE name = 'Demo Faculty'`);
    await pool.query(
      `
        DELETE FROM users
        WHERE email = ANY($1::text[])
      `,
      [["demo+lecturer@local.test", "demo+student1@local.test", "demo+student2@local.test"]]
    );
    await cleanupTestUsers();
  });

  test("returns 404 when DEMO_SEED_ENABLED is not true", async () => {
    delete process.env.DEMO_SEED_ENABLED;

    const res = await request(app).post("/api/demo/seed-attendance").set(auth(adminToken)).send({});
    expect(res.status).toBe(404);
  });

  test("returns 403 for non-admin", async () => {
    process.env.DEMO_SEED_ENABLED = "true";

    const res = await request(app).post("/api/demo/seed-attendance").set(auth(studentToken)).send({});
    expect(res.status).toBe(403);
  });

  test("returns 200 for admin when DEMO_SEED_ENABLED=true", async () => {
    process.env.DEMO_SEED_ENABLED = "true";

    const res = await request(app).post("/api/demo/seed-attendance").set(auth(adminToken)).send({});
    expect(res.status).toBe(200);
    expect(typeof res.body?.moduleId).toBe("string");
    expect(typeof res.body?.lecturerId).toBe("string");
    expect(Array.isArray(res.body?.studentIds)).toBe(true);
    expect(typeof res.body?.sessionId).toBe("string");
    expect(Array.isArray(res.body?.marked)).toBe(true);
  });
});
