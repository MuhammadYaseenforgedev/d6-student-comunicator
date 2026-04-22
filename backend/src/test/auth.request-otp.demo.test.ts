import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";

describe("Auth demo OTP bypass policy", () => {
  const app = createApp();
  const ENV_KEYS = [
    "NODE_ENV",
    "APP_ENV",
    "ALLOW_DEMO_OTP_BYPASS",
    "DEMO_OTP_ALLOWLIST",
    "DEMO_OTP_ALLOWED_ENVS",
    "DEMO_BYPASS_LOGIN",
  ] as const;
  const ORIGINAL_ENV = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Record<(typeof ENV_KEYS)[number], string | undefined>;
  const EMAIL_PREFIX = "auth_demo_policy_";

  function uniqueEmail(tag: string) {
    return `${EMAIL_PREFIX}${tag}_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
  }

  async function activeOtpCount(email: string): Promise<number> {
    const result = await pool.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM email_otps
        WHERE lower(email) = lower($1)
          AND purpose = 'REGISTER'
          AND consumed_at IS NULL
      `,
      [email]
    );
    return Number(result.rows[0]?.c ?? "0");
  }

  function restoreEnv() {
    for (const key of ENV_KEYS) {
      const previous = ORIGINAL_ENV[key];
      if (typeof previous === "string") {
        process.env[key] = previous;
      } else {
        delete process.env[key];
      }
    }
  }

  afterEach(async () => {
    restoreEnv();
    await pool.query(`DELETE FROM email_otps WHERE lower(email) LIKE $1`, [`${EMAIL_PREFIX}%@example.com`]);
    await pool.query(`DELETE FROM users WHERE lower(email) LIKE $1`, [`${EMAIL_PREFIX}%@example.com`]);
  });

  test("bypass disabled + allowlisted email returns no devOtp", async () => {
    const email = uniqueEmail("disabled");
    process.env.NODE_ENV = "test";
    process.env.APP_ENV = "demo";
    process.env.ALLOW_DEMO_OTP_BYPASS = "false";
    process.env.DEMO_OTP_ALLOWLIST = email;
    process.env.DEMO_OTP_ALLOWED_ENVS = "demo,staging,test";

    const res = await request(app).post("/api/auth/request-otp").send({ email, purpose: "REGISTER" });

    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(res.body?.devOtp).toBeUndefined();
    expect(await activeOtpCount(email)).toBeGreaterThan(0);
  });

  test("bypass enabled + non-allowlisted email follows normal non-demo OTP flow", async () => {
    const email = uniqueEmail("not_allowlisted");
    process.env.NODE_ENV = "test";
    process.env.APP_ENV = "demo";
    process.env.ALLOW_DEMO_OTP_BYPASS = "true";
    process.env.DEMO_OTP_ALLOWLIST = uniqueEmail("someone_else");
    process.env.DEMO_OTP_ALLOWED_ENVS = "demo,staging,test";

    const res = await request(app).post("/api/auth/request-otp").send({ email, purpose: "REGISTER" });

    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(res.body?.devOtp).toBeUndefined();
    expect(await activeOtpCount(email)).toBeGreaterThan(0);
  });

  test("bypass enabled + allowlisted email + allowed env returns devOtp", async () => {
    const email = uniqueEmail("allowed");
    process.env.NODE_ENV = "test";
    process.env.APP_ENV = "demo";
    process.env.ALLOW_DEMO_OTP_BYPASS = "true";
    process.env.DEMO_OTP_ALLOWLIST = ` ${email.toUpperCase()} `;
    process.env.DEMO_OTP_ALLOWED_ENVS = "demo,staging,test";

    const res = await request(app).post("/api/auth/request-otp").send({ email, purpose: "REGISTER" });

    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(String(res.body?.devOtp ?? "")).toMatch(/^\d{6}$/);
    expect(await activeOtpCount(email)).toBeGreaterThan(0);
  });

  test("env not in allowed env list returns no devOtp", async () => {
    const email = uniqueEmail("env_denied");
    process.env.NODE_ENV = "test";
    process.env.APP_ENV = "local";
    process.env.ALLOW_DEMO_OTP_BYPASS = "true";
    process.env.DEMO_OTP_ALLOWLIST = email;
    process.env.DEMO_OTP_ALLOWED_ENVS = "demo,staging";

    const res = await request(app).post("/api/auth/request-otp").send({ email, purpose: "REGISTER" });

    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(res.body?.devOtp).toBeUndefined();
    expect(await activeOtpCount(email)).toBeGreaterThan(0);
  });

  test("production env never bypasses even when explicitly allowlisted", async () => {
    const email = uniqueEmail("production_denied");
    process.env.NODE_ENV = "production";
    process.env.APP_ENV = "production";
    process.env.ALLOW_DEMO_OTP_BYPASS = "true";
    process.env.DEMO_OTP_ALLOWLIST = email;
    process.env.DEMO_OTP_ALLOWED_ENVS = "production,demo,test";

    const res = await request(app).post("/api/auth/request-otp").send({ email, purpose: "REGISTER" });

    expect(res.status).toBe(503);
    expect(res.body?.devOtp).toBeUndefined();
    expect(String(res.body?.error?.code ?? "")).toBe("EMAIL_PROVIDER");
    expect(await activeOtpCount(email)).toBe(0);
  });

  test("DEMO_BYPASS_LOGIN no longer bypasses login validation", async () => {
    const email = uniqueEmail("login_shortcut_removed");
    const password = "Passw0rd!";
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `
        INSERT INTO users (email, password_hash, role)
        VALUES ($1, $2, 'PARENT')
      `,
      [email, passwordHash]
    );

    process.env.NODE_ENV = "test";
    process.env.APP_ENV = "demo";
    process.env.ALLOW_DEMO_OTP_BYPASS = "true";
    process.env.DEMO_OTP_ALLOWLIST = email;
    process.env.DEMO_OTP_ALLOWED_ENVS = "demo,test";
    process.env.DEMO_BYPASS_LOGIN = "true";

    const res = await request(app).post("/api/auth/login").send({ email });

    expect(res.status).toBe(400);
    expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
  });
});
