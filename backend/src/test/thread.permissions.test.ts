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
  secondStudentToken: string;
  parentId: string;
  lecturerEmail: string;
  adminEmail: string;
  studentEmail: string;
  secondStudentEmail: string;
};

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Thread messaging permissions", () => {
  const ctx = {} as Ctx;
  const previousThreadsMode = process.env.THREADS_MODE;

  beforeAll(async () => {
    process.env.THREADS_MODE = "D6";

    const parent = await createUser("PARENT");
    const lecturer = await createUser("LECTURER");
    const admin = await createUser("ADMIN");
    const student = await createUser("STUDENT");
    const secondStudent = await createUser("STUDENT");

    ctx.parentToken = signJwt(parent);
    ctx.lecturerToken = signJwt(lecturer);
    ctx.adminToken = signJwt(admin);
    ctx.studentToken = signJwt(student);
    ctx.secondStudentToken = signJwt(secondStudent);

    ctx.parentId = parent.id;
    ctx.lecturerEmail = lecturer.email;
    ctx.adminEmail = admin.email;
    ctx.studentEmail = student.email;
    ctx.secondStudentEmail = secondStudent.email;
  });

  afterAll(async () => {
    process.env.THREADS_MODE = previousThreadsMode;
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

  test("Parent cannot start thread with Student under D6 mode", async () => {
    const res = await request(app)
      .post("/api/threads")
      .set(auth(ctx.parentToken))
      .send({ participantEmails: [ctx.studentEmail] });

    expect(res.status).toBe(403);
    expect(String(res.body?.error?.code ?? "")).toBe("FORBIDDEN");
    expect(String(res.body?.error?.message ?? "").toLowerCase()).toContain("not allowed between these roles");
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

  test("Student can start thread with another Student", async () => {
    const threadRes = await request(app)
      .post("/api/threads")
      .set(auth(ctx.studentToken))
      .send({ participantEmails: [ctx.secondStudentEmail] });

    expect([200, 201]).toContain(threadRes.status);
    const threadId = String(threadRes.body?.id ?? "");
    expect(threadId).toBeTruthy();

    const msgRes = await request(app)
      .post(`/api/threads/${threadId}/messages`)
      .set(auth(ctx.studentToken))
      .send({ body: "student to student" });

    expect(msgRes.status).toBe(201);
  });
});
