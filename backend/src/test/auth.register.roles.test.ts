import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";

const app = createApp();
const TEST_EMAIL_PREFIX = "test_register_role_";
const STAFF_PASSWORD = "staff-secret-123";

const ORIGINAL_ENV = {
  AUTH_REQUIRE_OTP: process.env.AUTH_REQUIRE_OTP,
  AUTH_ALLOW_PASSWORD_REGISTER: process.env.AUTH_ALLOW_PASSWORD_REGISTER,
  AUTH_ALLOW_PASSWORD_LOGIN: process.env.AUTH_ALLOW_PASSWORD_LOGIN,
  AUTH_STAFF_REGISTER_PASSWORD: process.env.AUTH_STAFF_REGISTER_PASSWORD,
};

function uniqueEmail(tag: string) {
  return `${TEST_EMAIL_PREFIX}${tag}_${Date.now()}_${Math.floor(Math.random() * 10000)}@co.za`;
}

function uniqueStudentNumber(tag: string) {
  return `${tag.toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function uniqueSouthAfricanId() {
  const ts = Date.now().toString();
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `${ts}${rand}`.slice(-13);
}

function restoreEnvVar(name: keyof typeof ORIGINAL_ENV) {
  const value = ORIGINAL_ENV[name];
  if (typeof value === "string") process.env[name] = value;
  else delete process.env[name];
}

describe("Auth register role policy", () => {
  beforeAll(() => {
    process.env.AUTH_REQUIRE_OTP = "false";
    process.env.AUTH_ALLOW_PASSWORD_REGISTER = "true";
    process.env.AUTH_ALLOW_PASSWORD_LOGIN = "true";
  });

  afterEach(() => {
    restoreEnvVar("AUTH_STAFF_REGISTER_PASSWORD");
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${TEST_EMAIL_PREFIX}%@co.za`]);
    restoreEnvVar("AUTH_REQUIRE_OTP");
    restoreEnvVar("AUTH_ALLOW_PASSWORD_REGISTER");
    restoreEnvVar("AUTH_ALLOW_PASSWORD_LOGIN");
    restoreEnvVar("AUTH_STAFF_REGISTER_PASSWORD");
  });

  test("allows STUDENT self-registration with SA ID and student number", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("student"),
      password: "Passw0rd!",
      role: "STUDENT",
      southAfricanId: uniqueSouthAfricanId(),
      studentNumber: uniqueStudentNumber("STU"),
    });

    expect(res.status).toBe(201);
    expect(res.body?.user?.role).toBe("STUDENT");
    expect(typeof res.body?.token).toBe("string");
  });

  test("rejects self-registration with a password shorter than 6 characters", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("short_password"),
      password: "12345",
      role: "PARENT",
    });

    expect(res.status).toBe(400);
    expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
    expect(String(res.body?.error?.message ?? "")).toMatch(/at least 6 characters/i);
  });

  test("blocks STUDENT self-registration when SA ID and student number are missing", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("student_missing_identity"),
      password: "Passw0rd!",
      role: "STUDENT",
    });

    expect(res.status).toBe(400);
    expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
  });

  test("allows PARENT self-registration", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("parent"),
      password: "Passw0rd!",
      role: "PARENT",
    });

    expect(res.status).toBe(201);
    expect(res.body?.user?.role).toBe("PARENT");
  });

  test("blocks LECTURER self-registration when staff password is missing", async () => {
    process.env.AUTH_STAFF_REGISTER_PASSWORD = STAFF_PASSWORD;

    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("lecturer_missing"),
      password: "Passw0rd!",
      role: "LECTURER",
    });

    expect(res.status).toBe(403);
    expect(String(res.body?.error?.code ?? "")).toBe("FORBIDDEN");
  });

  test("blocks ADMIN self-registration when staff password is wrong", async () => {
    process.env.AUTH_STAFF_REGISTER_PASSWORD = STAFF_PASSWORD;

    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("admin_wrong"),
      password: "Passw0rd!",
      role: "ADMIN",
      staffRegisterPassword: "wrong-password",
    });

    expect(res.status).toBe(403);
    expect(String(res.body?.error?.code ?? "")).toBe("FORBIDDEN");
  });

  test("allows LECTURER self-registration with correct staff password", async () => {
    process.env.AUTH_STAFF_REGISTER_PASSWORD = STAFF_PASSWORD;

    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("lecturer_ok"),
      password: "Passw0rd!",
      role: "LECTURER",
      staffRegisterPassword: STAFF_PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.body?.user?.role).toBe("LECTURER");
  });

  test("allows ADMIN self-registration with correct staff password", async () => {
    process.env.AUTH_STAFF_REGISTER_PASSWORD = STAFF_PASSWORD;

    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("admin_ok"),
      password: "Passw0rd!",
      role: "ADMIN",
      staffRegisterPassword: STAFF_PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.body?.user?.role).toBe("ADMIN");
  });

  test("requires student number during STUDENT login", async () => {
    const email = uniqueEmail("student_login");
    const password = "Passw0rd!";
    const studentNumber = uniqueStudentNumber("LOGIN");

    const registerRes = await request(app).post("/api/auth/register").send({
      email,
      password,
      role: "STUDENT",
      southAfricanId: uniqueSouthAfricanId(),
      studentNumber,
    });
    expect(registerRes.status).toBe(201);

    const missingStudentNumber = await request(app).post("/api/auth/login").send({
      email,
      password,
    });
    expect(missingStudentNumber.status).toBe(400);
    expect(String(missingStudentNumber.body?.error?.code ?? "")).toBe("VALIDATION");

    const wrongStudentNumber = await request(app).post("/api/auth/login").send({
      email,
      password,
      studentNumber: "WRONG-123",
    });
    expect(wrongStudentNumber.status).toBe(401);
    expect(String(wrongStudentNumber.body?.error?.code ?? "")).toBe("AUTH");

    const loginRes = await request(app).post("/api/auth/login").send({
      email,
      password,
      studentNumber,
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body?.user?.role).toBe("STUDENT");
    expect(typeof loginRes.body?.token).toBe("string");
  });
});
