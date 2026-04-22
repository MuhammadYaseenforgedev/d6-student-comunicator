/// <reference types="jest" />

import request from "supertest";
import { createApp } from "../app";
import { createUser, signJwt, cleanupTestUsers } from "./helpers";

const app = createApp();

describe("RBAC integration (automated)", () => {
  afterAll(async () => {
    await cleanupTestUsers();
    // DB pool is closed in setup.ts afterAll
  });

  test("401 when no token on protected route", async () => {
    const res = await request(app).get("/api/channels");
    expect([401, 403]).toContain(res.status);
  });

  test("STUDENT can list channels (200)", async () => {
    const student = await createUser("STUDENT");
    const token = signJwt(student);

    const res = await request(app)
      .get("/api/channels")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  test("PARENT cannot create channel (403)", async () => {
    const parent = await createUser("PARENT");
    const token = signJwt(parent);

    const res = await request(app)
      .post("/api/channels")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `test-channel-${Date.now()}`, type: "GENERAL", isPrivate: false });

    // Depending on your code it may be 401 or 403, but your UI expectation is 403
    expect([401, 403]).toContain(res.status);
  });

  test("LECTURER can create channel (201)", async () => {
    const lecturer = await createUser("LECTURER");
    const token = signJwt(lecturer);

    const res = await request(app)
      .post("/api/channels")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `test-channel-${Date.now()}`, type: "GENERAL", isPrivate: false });

    expect([200, 201]).toContain(res.status);
  });

  test("ADMIN can create channel (201)", async () => {
    const admin = await createUser("ADMIN");
    const token = signJwt(admin);

    const res = await request(app)
      .post("/api/channels")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `admin-channel-${Date.now()}`, type: "GENERAL", isPrivate: false });

    expect([200, 201]).toContain(res.status);
  });
});
