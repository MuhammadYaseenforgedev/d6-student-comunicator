import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";

describe("Auth register OTP flow", () => {
  const app = createApp();
  const EMAIL_PREFIX = "auth_register_otp_flow_";
  const ORIGINAL_ENV = {
    NODE_ENV: process.env.NODE_ENV,
    APP_ENV: process.env.APP_ENV,
    ALLOW_DEMO_OTP_BYPASS: process.env.ALLOW_DEMO_OTP_BYPASS,
    DEMO_OTP_ALLOWLIST: process.env.DEMO_OTP_ALLOWLIST,
    DEMO_OTP_ALLOWED_ENVS: process.env.DEMO_OTP_ALLOWED_ENVS,
    AUTH_REQUIRE_OTP: process.env.AUTH_REQUIRE_OTP,
    AUTH_ALLOW_PASSWORD_REGISTER: process.env.AUTH_ALLOW_PASSWORD_REGISTER,
  };

  function uniqueEmail(tag: string) {
    return `${EMAIL_PREFIX}${tag}_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
  }

  function uniqueStudentNumber(tag: string) {
    return `${tag.toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  function uniqueSouthAfricanId() {
    const ts = Date.now().toString();
    const rand = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, "0");
    return `${ts}${rand}`.slice(-13);
  }

  async function activeOtpCount(
    email: string,
    purpose: "LOGIN" | "REGISTER"
  ): Promise<number> {
    const result = await pool.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM email_otps
        WHERE lower(email) = lower($1)
          AND purpose = $2
          AND consumed_at IS NULL
      `,
      [email, purpose]
    );

    return Number(result.rows[0]?.c ?? "0");
  }

  function restoreEnv() {
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      if (typeof value === "string") {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }

  function configureOtpBypass(...emails: string[]) {
    process.env.NODE_ENV = "test";
    process.env.APP_ENV = "demo";
    process.env.ALLOW_DEMO_OTP_BYPASS = "true";
    process.env.DEMO_OTP_ALLOWLIST = emails.join(",");
    process.env.DEMO_OTP_ALLOWED_ENVS = "demo,staging,test";
    process.env.AUTH_REQUIRE_OTP = "true";
    delete process.env.AUTH_ALLOW_PASSWORD_REGISTER;
  }

  afterEach(async () => {
    restoreEnv();
    await pool.query(`DELETE FROM email_otps WHERE lower(email) LIKE $1`, [`${EMAIL_PREFIX}%@example.com`]);
    await pool.query(`DELETE FROM users WHERE lower(email) LIKE $1`, [`${EMAIL_PREFIX}%@example.com`]);
  });

  test("request-otp for registration creates an OTP that register can verify", async () => {
    const email = uniqueEmail("student_success");
    const requestEmail = ` ${email.toUpperCase()} `;
    configureOtpBypass(email);

    const otpRes = await request(app).post("/api/auth/request-otp").send({
      email: requestEmail,
      purpose: "REGISTER",
    });

    expect(otpRes.status).toBe(200);
    expect(otpRes.body?.ok).toBe(true);
    expect(String(otpRes.body?.devOtp ?? "")).toMatch(/^\d{6}$/);
    expect(await activeOtpCount(email, "REGISTER")).toBeGreaterThan(0);

    const registerRes = await request(app).post("/api/auth/register").send({
      email,
      password: "Passw0rd!",
      role: "STUDENT",
      otp: otpRes.body.devOtp,
      acceptedLegalTerms: true,
      studentNumber: uniqueStudentNumber("otp"),
      southAfricanId: uniqueSouthAfricanId(),
    });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body?.user?.role).toBe("STUDENT");
    expect(typeof registerRes.body?.token).toBe("string");
    expect(await activeOtpCount(email, "REGISTER")).toBe(0);
  });

  test("same email but wrong OTP purpose fails registration lookup", async () => {
    const email = uniqueEmail("wrong_purpose");
    configureOtpBypass(email);

    const otpRes = await request(app).post("/api/auth/request-otp").send({
      email,
      purpose: "LOGIN",
    });

    expect(otpRes.status).toBe(200);
    expect(String(otpRes.body?.devOtp ?? "")).toMatch(/^\d{6}$/);
    expect(await activeOtpCount(email, "LOGIN")).toBeGreaterThan(0);

    const registerRes = await request(app).post("/api/auth/register").send({
      email,
      password: "Passw0rd!",
      role: "PARENT",
      otp: otpRes.body.devOtp,
      acceptedLegalTerms: true,
    });

    expect(registerRes.status).toBe(400);
    expect(String(registerRes.body?.error?.code ?? "")).toBe("VALIDATION");
    expect(String(registerRes.body?.error?.message ?? "")).toBe("OTP not found");
  });

  test("mismatched email fails registration OTP lookup", async () => {
    const requestedEmail = uniqueEmail("requested_email");
    const registerEmail = uniqueEmail("register_email");
    configureOtpBypass(requestedEmail);

    const otpRes = await request(app).post("/api/auth/request-otp").send({
      email: requestedEmail,
      purpose: "REGISTER",
    });

    expect(otpRes.status).toBe(200);
    expect(String(otpRes.body?.devOtp ?? "")).toMatch(/^\d{6}$/);

    const registerRes = await request(app).post("/api/auth/register").send({
      email: registerEmail,
      password: "Passw0rd!",
      role: "PARENT",
      otp: otpRes.body.devOtp,
      acceptedLegalTerms: true,
    });

    expect(registerRes.status).toBe(400);
    expect(String(registerRes.body?.error?.code ?? "")).toBe("VALIDATION");
    expect(String(registerRes.body?.error?.message ?? "")).toBe("OTP not found");
  });
});
