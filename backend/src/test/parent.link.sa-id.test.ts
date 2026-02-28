import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../app";
import { pool } from "../config/db";
import { createUser, signJwt } from "./helpers";

const app = createApp();
const TEST_EMAIL_PREFIX = "test_parent_link_sa_";

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function uniqueEmail(tag: string) {
  return `${TEST_EMAIL_PREFIX}${tag}_${Date.now()}_${Math.floor(Math.random() * 10000)}@co.za`;
}

function uniqueStudentNumber() {
  return `SA-STU-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function uniqueSouthAfricanId() {
  const ts = Date.now().toString();
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `${ts}${rand}`.slice(-13);
}

function unwrapList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null) {
    const x = data as Record<string, unknown>;
    if (Array.isArray(x.value)) return x.value;
    if (Array.isArray(x.data)) return x.data;
    if (Array.isArray(x.items)) return x.items;
  }
  return [];
}

describe("Parent link requests use South African ID", () => {
  let parentToken = "";
  let southAfricanId = "";

  beforeAll(async () => {
    const parent = await createUser("PARENT", uniqueEmail("parent"));
    parentToken = signJwt(parent);

    southAfricanId = uniqueSouthAfricanId();
    const studentEmail = uniqueEmail("student");
    const studentNumber = uniqueStudentNumber();
    const passwordHash = await bcrypt.hash("Passw0rd!", 10);

    await pool.query(
      `
        INSERT INTO users (email, password_hash, role, public_student_id, south_african_id)
        VALUES ($1, $2, 'STUDENT', $3, $4)
      `,
      [studentEmail, passwordHash, studentNumber, southAfricanId]
    );
  });

  afterAll(async () => {
    await pool.query(
      `
        DELETE FROM parent_link_requests
        WHERE parent_user_id IN (SELECT id FROM users WHERE email LIKE $1)
           OR student_user_id IN (SELECT id FROM users WHERE email LIKE $1)
      `,
      [`${TEST_EMAIL_PREFIX}%@co.za`]
    );
    await pool.query(`DELETE FROM parent_links WHERE parent_user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [
      `${TEST_EMAIL_PREFIX}%@co.za`,
    ]);
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${TEST_EMAIL_PREFIX}%@co.za`]);
  });

  test("creates request with southAfricanId and returns it in list", async () => {
    const createRes = await request(app)
      .post("/api/parent/parent/link-requests")
      .set(auth(parentToken))
      .send({ southAfricanId });

    expect(createRes.status).toBe(201);
    expect(createRes.body?.status).toBe("PENDING");
    expect(createRes.body?.childId).toBe(southAfricanId);

    const listRes = await request(app).get("/api/parent/parent/link-requests").set(auth(parentToken));
    expect(listRes.status).toBe(200);
    const listRows = unwrapList(listRes.body) as Array<{ childId?: string }>;
    const found = listRows.some((x) => x.childId === southAfricanId);
    expect(found).toBe(true);
  });

  test("rejects non-SA-ID identifiers", async () => {
    const res = await request(app)
      .post("/api/parent/parent/link-requests")
      .set(auth(parentToken))
      .send({ childId: "student@example.com" });

    expect(res.status).toBe(400);
    expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
  });
});
