import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";

describe("Auth request-otp demo behavior", () => {
  const app = createApp();
  const previousNodeEnv = process.env.NODE_ENV;
  const previousOtpReturnDevCode = process.env.OTP_RETURN_DEV_CODE;

  afterEach(async () => {
    if (typeof previousNodeEnv === "string") process.env.NODE_ENV = previousNodeEnv;
    else delete process.env.NODE_ENV;

    if (typeof previousOtpReturnDevCode === "string") {
      process.env.OTP_RETURN_DEV_CODE = previousOtpReturnDevCode;
    } else {
      delete process.env.OTP_RETURN_DEV_CODE;
    }

    await pool.query(
      `
        DELETE FROM email_otps
        WHERE lower(email) LIKE 'demo+otp-test-%@local.test'
           OR lower(email) LIKE 'otp-test-%@example.com'
      `
    );
  });

  test("returns devOtp and stores OTP for demo email in production when flag is enabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.OTP_RETURN_DEV_CODE = "true";

    const email = `demo+otp-test-${Date.now()}@local.test`;
    const res = await request(app).post("/api/auth/request-otp").send({ email, purpose: "REGISTER" });

    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(typeof res.body?.devOtp).toBe("string");
    expect(String(res.body?.devOtp)).toMatch(/^\d{6}$/);

    const db = await pool.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM email_otps
        WHERE lower(email) = lower($1)
          AND purpose = 'REGISTER'
          AND consumed_at IS NULL
      `,
      [email]
    );
    expect(Number(db.rows[0]?.c ?? "0")).toBeGreaterThan(0);
  });

  test("keeps normal provider flow for non-demo emails in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.OTP_RETURN_DEV_CODE = "true";

    const email = `otp-test-${Date.now()}@example.com`;
    const res = await request(app).post("/api/auth/request-otp").send({ email, purpose: "REGISTER" });

    expect(res.status).toBe(503);
    expect(String(res.body?.error?.code ?? "")).toBe("EMAIL_PROVIDER");
  });
});
