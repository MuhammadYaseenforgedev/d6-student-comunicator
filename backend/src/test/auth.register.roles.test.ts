import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";

const app = createApp();
const TEST_EMAIL_PREFIX = "test_register_role_";
const STAFF_PASSWORD = "staff-secret-123";

const ORIGINAL_ENV = {
  AUTH_REQUIRE_OTP: process.env.AUTH_REQUIRE_OTP,
  AUTH_ALLOW_PASSWORD_REGISTER: process.env.AUTH_ALLOW_PASSWORD_REGISTER,
  AUTH_STAFF_REGISTER_PASSWORD: process.env.AUTH_STAFF_REGISTER_PASSWORD,
};

function uniqueEmail(tag: string) {
  return `${TEST_EMAIL_PREFIX}${tag}_${Date.now()}_${Math.floor(Math.random() * 10000)}@co.za`;
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
  });

  afterEach(() => {
    restoreEnvVar("AUTH_STAFF_REGISTER_PASSWORD");
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${TEST_EMAIL_PREFIX}%@co.za`]);
    restoreEnvVar("AUTH_REQUIRE_OTP");
    restoreEnvVar("AUTH_ALLOW_PASSWORD_REGISTER");
    restoreEnvVar("AUTH_STAFF_REGISTER_PASSWORD");
  });

  test("allows STUDENT self-registration", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("student"),
      password: "Passw0rd!",
      role: "STUDENT",
    });

    expect(res.status).toBe(201);
    expect(res.body?.user?.role).toBe("STUDENT");
    expect(typeof res.body?.token).toBe("string");
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
});
