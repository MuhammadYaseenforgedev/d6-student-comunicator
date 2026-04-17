import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { createUser } from "./helpers";

describe("Auth request-otp response parity", () => {
  const app = createApp();
  const EMAIL_PREFIX = "auth_request_otp_parity_";
  const ENV_KEYS = ["NODE_ENV", "APP_ENV", "ALLOW_DEMO_OTP_BYPASS"] as const;
  const ORIGINAL_ENV = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Record<(typeof ENV_KEYS)[number], string | undefined>;

  function uniqueEmail(tag: string) {
    return `${EMAIL_PREFIX}${tag}_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
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

  test("known and unknown login emails return the same public success shape", async () => {
    const knownEmail = uniqueEmail("known");
    const unknownEmail = uniqueEmail("unknown");

    await createUser("PARENT", knownEmail);

    process.env.NODE_ENV = "test";
    process.env.APP_ENV = "test";
    process.env.ALLOW_DEMO_OTP_BYPASS = "false";

    const knownRes = await request(app).post("/api/auth/request-otp").send({
      email: knownEmail,
      purpose: "LOGIN",
    });
    const unknownRes = await request(app).post("/api/auth/request-otp").send({
      email: unknownEmail,
      purpose: "LOGIN",
    });

    expect(knownRes.status).toBe(200);
    expect(unknownRes.status).toBe(200);
    expect(knownRes.body).toEqual(expect.objectContaining({ ok: true, expiresAt: expect.any(String) }));
    expect(unknownRes.body).toEqual(expect.objectContaining({ ok: true, expiresAt: expect.any(String) }));
    expect(knownRes.body.emailDeliveryEnabled).toBe(false);
    expect(unknownRes.body.emailDeliveryEnabled).toBe(false);
    expect(knownRes.body.devOtp).toBeUndefined();
    expect(unknownRes.body.devOtp).toBeUndefined();
    expect(Object.keys(knownRes.body).sort()).toEqual(Object.keys(unknownRes.body).sort());
  });

  test("production login OTP requests keep the same public shape when email delivery is unavailable", async () => {
    const knownEmail = uniqueEmail("prod_known");
    const unknownEmail = uniqueEmail("prod_unknown");

    await createUser("PARENT", knownEmail);

    process.env.NODE_ENV = "production";
    process.env.APP_ENV = "production";
    process.env.ALLOW_DEMO_OTP_BYPASS = "false";

    const knownRes = await request(app).post("/api/auth/request-otp").send({
      email: knownEmail,
      purpose: "LOGIN",
    });
    const unknownRes = await request(app).post("/api/auth/request-otp").send({
      email: unknownEmail,
      purpose: "LOGIN",
    });

    expect(knownRes.status).toBe(200);
    expect(unknownRes.status).toBe(200);
    expect(knownRes.body).toEqual(expect.objectContaining({ ok: true, expiresAt: expect.any(String) }));
    expect(unknownRes.body).toEqual(expect.objectContaining({ ok: true, expiresAt: expect.any(String) }));
    expect(knownRes.body.emailDeliveryEnabled).toBe(false);
    expect(unknownRes.body.emailDeliveryEnabled).toBe(false);
    expect(knownRes.body.devOtp).toBeUndefined();
    expect(unknownRes.body.devOtp).toBeUndefined();
    expect(Object.keys(knownRes.body).sort()).toEqual(Object.keys(unknownRes.body).sort());
  });
});
