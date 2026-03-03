import request from "supertest";
import { createApp } from "../app";

describe("CORS preflight", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCorsAllowOrigins = process.env.CORS_ALLOW_ORIGINS;
  const previousCorsOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (typeof previousNodeEnv === "string") process.env.NODE_ENV = previousNodeEnv;
    else delete process.env.NODE_ENV;

    if (typeof previousCorsAllowOrigins === "string") {
      process.env.CORS_ALLOW_ORIGINS = previousCorsAllowOrigins;
    } else {
      delete process.env.CORS_ALLOW_ORIGINS;
    }

    if (typeof previousCorsOrigin === "string") process.env.CORS_ORIGIN = previousCorsOrigin;
    else delete process.env.CORS_ORIGIN;
  });

  test("allows configured origin preflight on /api route", async () => {
    const origin = "https://d6-student-communicator-ni67guxb6-grimm-reaper7274s-projects.vercel.app";
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOW_ORIGINS = origin;
    delete process.env.CORS_ORIGIN;

    const app = createApp();
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");

    expect([200, 204]).toContain(res.status);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);

    const allowHeaders = String(res.headers["access-control-allow-headers"] ?? "").toLowerCase();
    expect(allowHeaders).toContain("authorization");
    expect(allowHeaders).toContain("content-type");
  });

  test("returns 403 for blocked origin in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOW_ORIGINS = "https://allowed.example.com";
    delete process.env.CORS_ORIGIN;

    const app = createApp();
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", "https://blocked.example.com")
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(403);
    expect(String(res.body?.error?.code ?? "")).toBe("CORS");
  });

  test("allows localhost by default in non-production", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.CORS_ALLOW_ORIGINS;
    delete process.env.CORS_ORIGIN;

    const app = createApp();
    const res = await request(app)
      .options("/api/auth/request-otp")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");

    expect([200, 204]).toContain(res.status);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});
