import crypto from "crypto";
import request from "supertest";
import { app } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

type Ctx = {
  parentToken: string;
  lecturerToken: string;
  adminToken: string;
  studentToken: string;
  parentId: string;
  lecturerEmail: string;
  adminEmail: string;
  studentEmail: string;
};

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Thread messaging permissions", () => {
  const ctx = {} as Ctx;

  beforeAll(async () => {
    const parent = await createUser("PARENT");
    const lecturer = await createUser("LECTURER");
    const admin = await createUser("ADMIN");
    const student = await createUser("STUDENT");

    ctx.parentToken = signJwt(parent);
    ctx.lecturerToken = signJwt(lecturer);
    ctx.adminToken = signJwt(admin);
    ctx.studentToken = signJwt(student);

    ctx.parentId = parent.id;
    ctx.lecturerEmail = lecturer.email;
    ctx.adminEmail = admin.email;
    ctx.studentEmail = student.email;
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  test("Parent can start thread with Lecturer", async () => {
    const res = await request(app)
      .post("/api/threads")
      .set(auth(ctx.parentToken))
      .send({ participantEmails: [ctx.lecturerEmail] });

    expect([200, 201]).toContain(res.status);
  });

  test("Parent can start thread with Admin", async () => {
    const res = await request(app)
      .post("/api/threads")
      .set(auth(ctx.parentToken))
      .send({ participantEmails: [ctx.adminEmail] });

    expect([200, 201]).toContain(res.status);
  });

  test("Parent cannot start thread with Student", async () => {
    const res = await request(app)
      .post("/api/threads")
      .set(auth(ctx.parentToken))
      .send({ participantEmails: [ctx.studentEmail] });

    expect(res.status).toBe(403);
  });

  test("Parent cannot send message into a parent-student thread", async () => {
    const parentStudentThreadId = crypto.randomUUID();

    const studentIdRes = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [ctx.studentEmail]
    );
    const studentId = studentIdRes.rows[0]?.id;
    expect(studentId).toBeTruthy();

    await pool.query(`INSERT INTO threads (id, created_by) VALUES ($1, $2)`, [parentStudentThreadId, ctx.parentId]);
    await pool.query(
      `
        INSERT INTO thread_participants (thread_id, user_id)
        VALUES ($1, $2), ($1, $3)
      `,
      [parentStudentThreadId, ctx.parentId, studentId]
    );

    const res = await request(app)
      .post(`/api/threads/${parentStudentThreadId}/messages`)
      .set(auth(ctx.parentToken))
      .send({ body: "hello" });

    expect(res.status).toBe(403);
  });

  test("Lecturer can reply to Parent", async () => {
    const threadRes = await request(app)
      .post("/api/threads")
      .set(auth(ctx.parentToken))
      .send({ participantEmails: [ctx.lecturerEmail] });

    expect([200, 201]).toContain(threadRes.status);
    const threadId = String(threadRes.body?.id ?? "");
    expect(threadId).toBeTruthy();

    const msgRes = await request(app)
      .post(`/api/threads/${threadId}/messages`)
      .set(auth(ctx.lecturerToken))
      .send({ body: "reply from lecturer" });

    expect(msgRes.status).toBe(201);
  });

  test("Existing student<->lecturer messaging still works", async () => {
    const threadRes = await request(app)
      .post("/api/threads")
      .set(auth(ctx.studentToken))
      .send({ participantEmails: [ctx.lecturerEmail] });

    expect([200, 201]).toContain(threadRes.status);
    const threadId = String(threadRes.body?.id ?? "");
    expect(threadId).toBeTruthy();

    const msgRes = await request(app)
      .post(`/api/threads/${threadId}/messages`)
      .set(auth(ctx.studentToken))
      .send({ body: "student to lecturer" });

    expect(msgRes.status).toBe(201);
  });
});
