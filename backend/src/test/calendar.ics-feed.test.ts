import crypto from "crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

const app = createApp();
jest.setTimeout(30000);

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function futureIso(daysFromNow: number, hour = 8): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function createCalendarEntry(token: string, title: string, daysFromNow: number) {
  return request(app)
    .post("/api/calendar")
    .set(auth(token))
    .send({
      title,
      description: `${title} description`,
      location: "Forge Campus",
      startsAt: futureIso(daysFromNow, 8),
      endsAt: futureIso(daysFromNow, 9),
    });
}

async function createFeedToken(token: string, childId?: string) {
  return request(app)
    .post("/api/calendar/feed-token")
    .set(auth(token))
    .send(childId ? { childId } : {});
}

async function loadIcs(feedToken: string) {
  return request(app).get(`/api/calendar/ics/${encodeURIComponent(feedToken)}`);
}

describe("private signed calendar ICS feeds", () => {
  const unique = `test_calendar_ics_${Date.now()}`;

  afterAll(async () => {
    await cleanupTestUsers();
  });

  test("student feed returns ICS for allowed own events only", async () => {
    const student = await createUser("STUDENT", `${unique}_student@co.za`);
    const otherStudent = await createUser("STUDENT", `${unique}_other_student@co.za`);
    const studentToken = signJwt(student);
    const otherStudentToken = signJwt(otherStudent);

    const ownTitle = `${unique} own calendar event`;
    const otherTitle = `${unique} unrelated calendar event`;

    const own = await createCalendarEntry(studentToken, ownTitle, 7);
    const other = await createCalendarEntry(otherStudentToken, otherTitle, 7);
    expect(own.status).toBe(201);
    expect(other.status).toBe(201);

    const tokenRes = await createFeedToken(studentToken);
    expect(tokenRes.status).toBe(200);
    expect(String(tokenRes.body?.feedUrl ?? "")).toContain("/api/calendar/ics/");

    const icsRes = await loadIcs(String(tokenRes.body?.token ?? ""));
    expect(icsRes.status).toBe(200);
    expect(String(icsRes.headers["content-type"] ?? "")).toContain("text/calendar");
    expect(icsRes.text).toContain("BEGIN:VCALENDAR");
    expect(icsRes.text).toContain("VERSION:2.0");
    expect(icsRes.text).toContain("BEGIN:VEVENT");
    expect(icsRes.text).toContain(`SUMMARY:${ownTitle}`);
    expect(icsRes.text).not.toContain(otherTitle);
  });

  test("parent feed is child-scoped and cannot be generated for unrelated children", async () => {
    const parent = await createUser("PARENT", `${unique}_parent@co.za`);
    const child = await createUser("STUDENT", `${unique}_child@co.za`);
    const unrelatedChild = await createUser("STUDENT", `${unique}_unrelated_child@co.za`);
    const parentToken = signJwt(parent);
    const childToken = signJwt(child);
    const unrelatedChildToken = signJwt(unrelatedChild);

    await pool.query(
      `
        INSERT INTO parent_links (parent_user_id, student_user_id)
        VALUES ($1, $2)
      `,
      [parent.id, child.id]
    );

    const childTitle = `${unique} linked child event`;
    const unrelatedTitle = `${unique} unrelated child event`;
    expect((await createCalendarEntry(childToken, childTitle, 8)).status).toBe(201);
    expect((await createCalendarEntry(unrelatedChildToken, unrelatedTitle, 8)).status).toBe(201);

    const deniedToken = await createFeedToken(parentToken, unrelatedChild.id);
    expect(deniedToken.status).toBe(403);

    const tokenRes = await createFeedToken(parentToken, child.id);
    expect(tokenRes.status).toBe(200);

    const icsRes = await loadIcs(String(tokenRes.body?.token ?? ""));
    expect(icsRes.status).toBe(200);
    expect(icsRes.text).toContain(`SUMMARY:${childTitle}`);
    expect(icsRes.text).not.toContain(unrelatedTitle);
  });

  test("academic and super admins can create feed tokens while finance admin is blocked", async () => {
    const academicAdmin = await createUser("ADMIN", `${unique}_academic@co.za`, "Passw0rd!", "ACADEMIC");
    const superAdmin = await createUser("ADMIN", `${unique}_super@co.za`, "Passw0rd!", "SUPER");
    const financeAdmin = await createUser("ADMIN", `${unique}_finance@co.za`, "Passw0rd!", "FINANCE");

    const academicToken = signJwt(academicAdmin);
    const superToken = signJwt(superAdmin);
    const financeToken = signJwt(financeAdmin);

    const academicTitle = `${unique} academic admin event`;
    expect((await createCalendarEntry(academicToken, academicTitle, 9)).status).toBe(201);

    const academicFeed = await createFeedToken(academicToken);
    expect(academicFeed.status).toBe(200);
    const academicIcs = await loadIcs(String(academicFeed.body?.token ?? ""));
    expect(academicIcs.status).toBe(200);
    expect(academicIcs.text).toContain(`SUMMARY:${academicTitle}`);

    expect((await createFeedToken(superToken)).status).toBe(200);
    expect((await createFeedToken(financeToken)).status).toBe(403);
  });

  test("invalid and expired feed tokens are rejected", async () => {
    const invalid = await request(app).get("/api/calendar/ics/not-a-real-token");
    expect(invalid.status).toBe(401);

    const student = await createUser("STUDENT", `${unique}_expired_student@co.za`);
    const secret = process.env.JWT_SECRET ?? "dev_secret_change_me";
    const expired = jwt.sign(
      {
        purpose: "calendar-feed",
        userId: student.id,
        role: "STUDENT",
      },
      secret,
      {
        expiresIn: -1,
        issuer: "forge-communicator",
        audience: "calendar-feed",
      }
    );

    const expiredRes = await loadIcs(expired);
    expect(expiredRes.status).toBe(401);
  });

  test("ICS feed does not include finance, result, attendance, or sync metadata details", async () => {
    const student = await createUser("STUDENT", `${unique}_privacy_student@co.za`);
    const marker = await createUser("ADMIN", `${unique}_privacy_admin@co.za`, "Passw0rd!", "ACADEMIC");
    const studentToken = signJwt(student);

    const financeSecret = `${unique} finance private balance`;
    const resultSecret = `${unique} result private mark`;
    const syncSecret = `${unique} hidden sync metadata`;
    const courseId = crypto.randomUUID();
    const facultyId = crypto.randomUUID();
    const moduleId = crypto.randomUUID();

    expect((await createCalendarEntry(studentToken, `${unique} visible safe event`, 10)).status).toBe(201);

    await pool.query(
      `
        INSERT INTO finance_transactions (id, user_id, amount_cents, currency, description)
        VALUES ($1, $2, 12345, 'ZAR', $3)
      `,
      [crypto.randomUUID(), student.id, financeSecret]
    );
    await pool.query(
      `
        INSERT INTO assessment_results (id, student_user_id, subject, score, out_of)
        VALUES ($1, $2, $3, 88, 100)
      `,
      [crypto.randomUUID(), student.id, resultSecret]
    );

    await pool.query(`INSERT INTO faculties (id, name) VALUES ($1, $2)`, [
      facultyId,
      `${unique} Privacy Faculty`,
    ]);
    await pool.query(
      `
        INSERT INTO courses (id, code, name, description, is_active)
        VALUES ($1, $2, $3, $4, true)
      `,
      [courseId, `${unique.toUpperCase()}_PRIV_COURSE`, `${unique} Privacy Course`, "ICS privacy test"]
    );
    await pool.query(
      `
        INSERT INTO faculty_modules (id, faculty_id, course_id, code, name)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [moduleId, facultyId, courseId, `${unique.toUpperCase()}_PRIV`, `${unique} Privacy Module`]
    );

    const session = await pool.query<{ id: string }>(
      `
        INSERT INTO attendance_sessions (lecturer_id, module_id, attendance_date, created_by)
        VALUES ($1, $2, CURRENT_DATE, $1)
        RETURNING id
      `,
      [marker.id, moduleId]
    );
    await pool.query(
      `
        INSERT INTO attendance_records (session_id, student_id, status, status_reason, marked_by)
        VALUES ($1, $2, 'ABSENT', $3, $4)
      `,
      [session.rows[0].id, student.id, `${unique} attendance private reason`, marker.id]
    );
    await pool.query(
      `
        UPDATE calendar_entries
        SET sync_metadata = $2::jsonb
        WHERE user_id = $1
      `,
      [student.id, JSON.stringify({ privateNote: syncSecret })]
    );

    const tokenRes = await createFeedToken(studentToken);
    expect(tokenRes.status).toBe(200);
    const icsRes = await loadIcs(String(tokenRes.body?.token ?? ""));
    expect(icsRes.status).toBe(200);
    expect(icsRes.text).not.toContain(financeSecret);
    expect(icsRes.text).not.toContain(resultSecret);
    expect(icsRes.text).not.toContain("attendance private reason");
    expect(icsRes.text).not.toContain(syncSecret);
    expect(icsRes.text).not.toContain("syncMetadata");

    await pool.query(`DELETE FROM faculty_modules WHERE id = $1`, [moduleId]);
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.query(`DELETE FROM faculties WHERE id = $1`, [facultyId]);
  });
});
