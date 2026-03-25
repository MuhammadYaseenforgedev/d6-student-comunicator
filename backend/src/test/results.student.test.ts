import request from "supertest";
import { app } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

type NotificationDto = {
  id: string;
  category: string;
  meta?: Record<string, unknown>;
};

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const source = data as Record<string, unknown>;
    if (Array.isArray(source.value)) return source.value as T[];
    if (Array.isArray(source.data)) return source.data as T[];
    if (Array.isArray(source.items)) return source.items as T[];
  }
  return [];
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Student results access", () => {
  afterAll(async () => {
    await cleanupTestUsers();
  });

  test("student can view and download their own published results and notifications link to the results page", async () => {
    const admin = await createUser("ADMIN");
    const student = await createUser("STUDENT");

    const adminToken = signJwt(admin);
    const studentToken = signJwt(student);
    const childId = `STU-${Date.now()}`;

    await pool.query(`UPDATE users SET public_student_id = $2 WHERE id = $1`, [student.id, childId]);

    const mathResultRes = await request(app)
      .post("/api/parent/admin/results")
      .set(auth(adminToken))
      .send({
        childId,
        subject: "Mathematics",
        score: 81,
        outOf: 100,
        date: "2026-03-17",
      });

    expect(mathResultRes.status).toBe(201);

    const scienceResultRes = await request(app)
      .post("/api/parent/admin/results")
      .set(auth(adminToken))
      .send({
        childId,
        subject: "Science",
        score: 74,
        outOf: 100,
        date: "2026-03-16",
      });

    expect(scienceResultRes.status).toBe(201);

    const listRes = await request(app).get("/api/parent/student/results").set(auth(studentToken));
    expect(listRes.status).toBe(200);
    const results = unwrapList<Record<string, unknown>>(listRes.body);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: "Mathematics", score: 81, outOf: 100 }),
        expect.objectContaining({ subject: "Science", score: 74, outOf: 100 }),
      ])
    );

    const downloadRes = await request(app).get("/api/parent/student/results/download").set(auth(studentToken));
    expect(downloadRes.status).toBe(200);
    expect(String(downloadRes.headers["content-type"] ?? "")).toContain("text/csv");
    expect(String(downloadRes.text ?? "")).toContain(childId);
    expect(String(downloadRes.text ?? "")).toContain("Mathematics");

    const notificationRes = await request(app)
      .get("/api/notifications?unreadOnly=true")
      .set(auth(studentToken));

    expect(notificationRes.status).toBe(200);
    const items = Array.isArray(notificationRes.body?.value) ? (notificationRes.body.value as NotificationDto[]) : [];
    const resultNotification = items.find((item) => item.category === "RESULT");
    expect(resultNotification).toBeTruthy();
    expect(resultNotification?.meta?.href).toBe("/app/results");
  });
});
