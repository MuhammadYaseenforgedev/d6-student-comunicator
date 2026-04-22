import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { createUser } from "./helpers";

const app = createApp();
const TEST_EMAIL_PREFIX = "test_auth_login_policy_";

const ORIGINAL_ENV = {
  AUTH_REQUIRE_OTP: process.env.AUTH_REQUIRE_OTP,
  AUTH_ALLOW_PASSWORD_LOGIN: process.env.AUTH_ALLOW_PASSWORD_LOGIN,
  APP_ENV: process.env.APP_ENV,
};

function restoreEnvVar(name: keyof typeof ORIGINAL_ENV) {
  const value = ORIGINAL_ENV[name];
  if (typeof value === "string") process.env[name] = value;
  else delete process.env[name];
}

describe("Auth login policy", () => {
  afterEach(() => {
    restoreEnvVar("AUTH_REQUIRE_OTP");
    restoreEnvVar("AUTH_ALLOW_PASSWORD_LOGIN");
    restoreEnvVar("APP_ENV");
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${TEST_EMAIL_PREFIX}%@co.za`]);
    restoreEnvVar("AUTH_REQUIRE_OTP");
    restoreEnvVar("AUTH_ALLOW_PASSWORD_LOGIN");
    restoreEnvVar("APP_ENV");
  });

  test("rejects wrong password with 401 when password login is enabled", async () => {
    process.env.APP_ENV = "test";
    process.env.AUTH_REQUIRE_OTP = "false";
    process.env.AUTH_ALLOW_PASSWORD_LOGIN = "true";

    const user = await createUser("PARENT", `${TEST_EMAIL_PREFIX}wrong_password@co.za`, "Passw0rd!");

    const res = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "DefinitelyWrong1!",
    });

    expect(res.status).toBe(401);
    expect(String(res.body?.error?.code ?? "")).toBe("AUTH");
  });

  test("blocks password-only login by default when OTP is required", async () => {
    process.env.APP_ENV = "test";
    process.env.AUTH_REQUIRE_OTP = "true";
    delete process.env.AUTH_ALLOW_PASSWORD_LOGIN;

    const user = await createUser("PARENT", `${TEST_EMAIL_PREFIX}otp_default@co.za`, "Passw0rd!");

    const res = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "Passw0rd!",
    });

    expect(res.status).toBe(400);
    expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
  });

  test("allows password-only login only when explicitly enabled", async () => {
    process.env.APP_ENV = "test";
    process.env.AUTH_REQUIRE_OTP = "true";
    process.env.AUTH_ALLOW_PASSWORD_LOGIN = "true";

    const user = await createUser("PARENT", `${TEST_EMAIL_PREFIX}explicit_password_login@co.za`, "Passw0rd!");

    const res = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "Passw0rd!",
    });

    expect(res.status).toBe(200);
    expect(typeof res.body?.token).toBe("string");
    expect(res.body?.user?.role).toBe("PARENT");
  });
});
