import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

const app = createApp();

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Admin account management", () => {
  const unique = `test_accounts_${Date.now()}`;
  let adminToken = "";
  let lecturerToken = "";
  let adminId = "";
  let studentId = "";
  let lecturerId = "";

  beforeAll(async () => {
    const admin = await createUser("ADMIN", `${unique}_admin@co.za`);
    const lecturer = await createUser("LECTURER", `${unique}_lecturer@co.za`);
    const student = await createUser("STUDENT", `${unique}_student@co.za`);
    const parent = await createUser("PARENT", `${unique}_parent@co.za`);

    adminId = admin.id;
    lecturerId = lecturer.id;
    studentId = student.id;
    adminToken = signJwt(admin);
    lecturerToken = signJwt(lecturer);

    await pool.query(
      `
        UPDATE users
        SET first_name = 'Demo',
            last_name = 'Student',
            course_name = 'Computer Science',
            public_student_id = $2
        WHERE id = $1
      `,
      [student.id, `${unique.toUpperCase()}_STU`]
    );

    await pool.query(
      `
        UPDATE users
        SET can_link_children = true,
            first_name = 'Demo',
            last_name = 'Parent'
        WHERE id = $1
      `,
      [parent.id]
    );
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  test("admin can view registered admins, lecturers, students, and parents", async () => {
    const res = await request(app)
      .get("/api/users/admin/accounts")
      .set(auth(adminToken))
      .query({ q: unique, limit: 50 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.value)).toBe(true);

    const emails = new Set(res.body.value.map((row: { email?: string }) => String(row.email ?? "")));
    expect(emails.has(`${unique}_admin@co.za`)).toBe(true);
    expect(emails.has(`${unique}_lecturer@co.za`)).toBe(true);
    expect(emails.has(`${unique}_student@co.za`)).toBe(true);
    expect(emails.has(`${unique}_parent@co.za`)).toBe(true);

    const studentRow = res.body.value.find((row: { email?: string }) => row.email === `${unique}_student@co.za`);
    expect(String(studentRow?.studentNumber ?? "")).toBe(`${unique.toUpperCase()}_STU`);
  });

  test("non-admin cannot view admin account registry", async () => {
    const res = await request(app)
      .get("/api/users/admin/accounts")
      .set(auth(lecturerToken))
      .query({ q: unique });

    expect([401, 403]).toContain(res.status);
  });

  test("non-admin cannot update admin-managed account fields", async () => {
    const res = await request(app)
      .patch(`/api/users/admin/accounts/${studentId}`)
      .set(auth(lecturerToken))
      .send({ studentNumber: `${unique.toUpperCase()}_BLOCKED` });

    expect([401, 403]).toContain(res.status);
  });

  test("admin cannot delete the current account", async () => {
    const res = await request(app)
      .delete(`/api/users/admin/accounts/${adminId}`)
      .set(auth(adminToken));

    expect(res.status).toBe(400);
  });

  test("admin can delete another account", async () => {
    const target = await createUser("LECTURER", `${unique}_delete_me@co.za`);

    const res = await request(app)
      .delete(`/api/users/admin/accounts/${target.id}`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(Boolean(res.body?.ok)).toBe(true);

    const db = await pool.query(`SELECT 1 FROM users WHERE id = $1 LIMIT 1`, [target.id]);
    expect(db.rowCount ?? 0).toBe(0);
  });

  test("admin can update a student's student number", async () => {
    const nextStudentNumber = `${unique.toUpperCase()}_STU_EDITED`;

    const res = await request(app)
      .patch(`/api/users/admin/accounts/${studentId}`)
      .set(auth(adminToken))
      .send({ studentNumber: nextStudentNumber });

    expect(res.status).toBe(200);
    expect(Boolean(res.body?.ok)).toBe(true);
    expect(String(res.body?.user?.studentNumber ?? "")).toBe(nextStudentNumber);

    const db = await pool.query<{ public_student_id: string | null }>(
      `SELECT public_student_id FROM users WHERE id = $1 LIMIT 1`,
      [studentId]
    );
    expect(String(db.rows[0]?.public_student_id ?? "")).toBe(nextStudentNumber);
  });

  test("admin can reset another account password", async () => {
    const nextPassword = "ResetPass123!";

    const res = await request(app)
      .patch(`/api/users/admin/accounts/${lecturerId}`)
      .set(auth(adminToken))
      .send({ password: nextPassword });

    expect(res.status).toBe(200);
    expect(Boolean(res.body?.ok)).toBe(true);

    const db = await pool.query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1 LIMIT 1`,
      [lecturerId]
    );
    const matches = await bcrypt.compare(nextPassword, String(db.rows[0]?.password_hash ?? ""));
    expect(matches).toBe(true);
  });

  test("admin cannot reset an account password below the minimum length", async () => {
    const res = await request(app)
      .patch(`/api/users/admin/accounts/${lecturerId}`)
      .set(auth(adminToken))
      .send({ password: "12345" });

    expect(res.status).toBe(400);
    expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
    expect(String(res.body?.error?.message ?? "")).toMatch(/at least 6 characters/i);
  });

  test("admin-create rejects a password shorter than 6 characters", async () => {
    const res = await request(app)
      .post("/api/auth/admin-create")
      .set(auth(adminToken))
      .send({
        email: `${unique}_short_password@co.za`,
        password: "12345",
        role: "LECTURER",
      });

    expect(res.status).toBe(400);
    expect(String(res.body?.error?.code ?? "")).toBe("VALIDATION");
    expect(String(res.body?.error?.message ?? "")).toMatch(/at least 6 characters/i);
  });
});
