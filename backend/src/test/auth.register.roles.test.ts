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

  test("rejects registration when acceptedLegalTerms is missing", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("legal_missing"),
      password: "Passw0rd!",
      role: "PARENT",
    });

    expect(res.status).toBe(400);
    expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
    expect(String(res.body?.error?.message ?? "")).toBe(
      "You must accept the POPIA Disclosure and IT Terms of Use before registering."
    );
  });

  test("rejects registration when acceptedLegalTerms is false", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("legal_false"),
      password: "Passw0rd!",
      role: "PARENT",
      acceptedLegalTerms: false,
    });

    expect(res.status).toBe(400);
    expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
    expect(String(res.body?.error?.message ?? "")).toBe(
      "You must accept the POPIA Disclosure and IT Terms of Use before registering."
    );
  });

  test("rejects missing acceptedLegalTerms before OTP validation when OTP is required", async () => {
    const previousRequireOtp = process.env.AUTH_REQUIRE_OTP;
    const previousAllowPasswordRegister = process.env.AUTH_ALLOW_PASSWORD_REGISTER;
    process.env.AUTH_REQUIRE_OTP = "true";
    delete process.env.AUTH_ALLOW_PASSWORD_REGISTER;

    try {
      const res = await request(app).post("/api/auth/register").send({
        email: uniqueEmail("legal_before_otp"),
        password: "Passw0rd!",
        role: "PARENT",
        otp: "000000",
      });

      expect(res.status).toBe(400);
      expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
      expect(String(res.body?.error?.message ?? "")).toBe(
        "You must accept the POPIA Disclosure and IT Terms of Use before registering."
      );
    } finally {
      if (typeof previousRequireOtp === "string") process.env.AUTH_REQUIRE_OTP = previousRequireOtp;
      else process.env.AUTH_REQUIRE_OTP = "false";

      if (typeof previousAllowPasswordRegister === "string") {
        process.env.AUTH_ALLOW_PASSWORD_REGISTER = previousAllowPasswordRegister;
      } else {
        process.env.AUTH_ALLOW_PASSWORD_REGISTER = "true";
      }
    }
  });

  test("accepts true acceptedLegalTerms into normal OTP validation flow", async () => {
    const previousRequireOtp = process.env.AUTH_REQUIRE_OTP;
    const previousAllowPasswordRegister = process.env.AUTH_ALLOW_PASSWORD_REGISTER;
    process.env.AUTH_REQUIRE_OTP = "true";
    delete process.env.AUTH_ALLOW_PASSWORD_REGISTER;

    try {
      const res = await request(app).post("/api/auth/register").send({
        email: uniqueEmail("legal_true_otp"),
        password: "Passw0rd!",
        role: "PARENT",
        acceptedLegalTerms: true,
        otp: "000000",
      });

      expect(res.status).toBe(400);
      expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
      expect(String(res.body?.error?.message ?? "")).toBe("OTP not found");
    } finally {
      if (typeof previousRequireOtp === "string") process.env.AUTH_REQUIRE_OTP = previousRequireOtp;
      else process.env.AUTH_REQUIRE_OTP = "false";

      if (typeof previousAllowPasswordRegister === "string") {
        process.env.AUTH_ALLOW_PASSWORD_REGISTER = previousAllowPasswordRegister;
      } else {
        process.env.AUTH_ALLOW_PASSWORD_REGISTER = "true";
      }
    }
  });

  test("allows STUDENT self-registration with SA ID and generates a student number", async () => {
    const email = uniqueEmail("student");
    const res = await request(app).post("/api/auth/register").send({
      email,
      password: "Passw0rd!",
      role: "STUDENT",
      acceptedLegalTerms: true,
      southAfricanId: uniqueSouthAfricanId(),
    });

    expect(res.status).toBe(201);
    expect(res.body?.user?.role).toBe("STUDENT");
    expect(typeof res.body?.token).toBe("string");

    const stored = await pool.query<{ public_student_id: string | null }>(
      `SELECT public_student_id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );
    expect(String(stored.rows[0]?.public_student_id ?? "")).toMatch(/^FA-\d{8}$/);
  });

  test("rejects self-registration with a password shorter than 8 characters", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("short_password"),
      password: "12345",
      role: "PARENT",
      acceptedLegalTerms: true,
    });

    expect(res.status).toBe(400);
    expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
    expect(String(res.body?.error?.message ?? "")).toMatch(/at least 8 characters/i);
  });

  test("blocks STUDENT self-registration when SA ID is missing", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("student_missing_identity"),
      password: "Passw0rd!",
      role: "STUDENT",
      acceptedLegalTerms: true,
    });

    expect(res.status).toBe(400);
    expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
  });

  test("allows PARENT self-registration", async () => {
    const email = uniqueEmail("parent");

    const res = await request(app).post("/api/auth/register").send({
      email,
      password: "Passw0rd!",
      role: "PARENT",
      acceptedLegalTerms: true,
    });

    expect(res.status).toBe(201);
    expect(res.body?.user?.role).toBe("PARENT");

    const stored = await pool.query<{ accepted_legal_terms_at: string | null }>(
      `
        SELECT accepted_legal_terms_at::text AS accepted_legal_terms_at
        FROM users
        WHERE lower(email) = lower($1)
        LIMIT 1
      `,
      [email]
    );

    expect(stored.rows[0]?.accepted_legal_terms_at).toBeTruthy();
  });

  test("blocks LECTURER self-registration when staff password is missing", async () => {
    process.env.AUTH_STAFF_REGISTER_PASSWORD = STAFF_PASSWORD;

    const res = await request(app).post("/api/auth/register").send({
      email: uniqueEmail("lecturer_missing"),
      password: "Passw0rd!",
      role: "LECTURER",
      acceptedLegalTerms: true,
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
      acceptedLegalTerms: true,
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
      acceptedLegalTerms: true,
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
      acceptedLegalTerms: true,
      staffRegisterPassword: STAFF_PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.body?.user?.role).toBe("ADMIN");
  });

  test("allows STUDENT login with email without requiring student number", async () => {
    const email = uniqueEmail("student_login");
    const password = "Passw0rd!";

    const registerRes = await request(app).post("/api/auth/register").send({
      email,
      password,
      role: "STUDENT",
      acceptedLegalTerms: true,
      southAfricanId: uniqueSouthAfricanId(),
    });
    expect(registerRes.status).toBe(201);

    const stored = await pool.query<{ public_student_id: string | null }>(
      `SELECT public_student_id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );
    const studentNumber = String(stored.rows[0]?.public_student_id ?? "");
    expect(studentNumber).toMatch(/^FA-\d{8}$/);

    const loginRes = await request(app).post("/api/auth/login").send({
      email,
      password,
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body?.user?.role).toBe("STUDENT");
    expect(typeof loginRes.body?.token).toBe("string");

    const studentNumberIgnored = await request(app).post("/api/auth/login").send({
      email,
      password,
      studentNumber: "WRONG-123",
    });
    expect(studentNumberIgnored.status).toBe(200);
    expect(studentNumberIgnored.body?.user?.role).toBe("STUDENT");
    expect(typeof studentNumberIgnored.body?.token).toBe("string");
  });
});
