import request from "supertest";
import crypto from "crypto";
import { createApp } from "../app";
import { cleanupTestUsers, createChannel, createEvent, createUser, signJwt } from "./helpers";

const app = createApp();

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function extractList(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.value)) return body.value;
  return [];
}

describe("Calendar aggregates channel events", () => {
  let studentToken = "";
  let eventId = "";
  let eventDate = "";

  beforeAll(async () => {
    const student = await createUser("STUDENT");
    const lecturer = await createUser("LECTURER");
    studentToken = signJwt(student);

    const channelId = await createChannel(lecturer.id, `calendar-events-${Date.now()}`);
    eventId = await createEvent(channelId, lecturer.id, `calendar-event-${Date.now()}`);

    const eventsRes = await request(app).get(`/api/channels/${channelId}/events`).set(auth(studentToken));
    const item = extractList(eventsRes.body).find((e: any) => String(e?.id ?? "") === eventId);
    eventDate = String(item?.startsAt ?? "").slice(0, 10);
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  test("student /api/calendar includes channel event and supports date filter", async () => {
    const allRes = await request(app).get("/api/calendar").set(auth(studentToken));
    expect(allRes.status).toBe(200);
    expect(Array.isArray(allRes.body?.value)).toBe(true);

    const dateRes = await request(app).get(`/api/calendar?date=${eventDate}`).set(auth(studentToken));
    expect(dateRes.status).toBe(200);
    expect(Array.isArray(dateRes.body?.value)).toBe(true);
    expect(dateRes.body.value.some((x: any) => String(x?.id ?? "") === eventId)).toBe(true);
  });

  test("calendar event feed matches channel events for student-role token", async () => {
    const lecturer = await createUser("LECTURER");
    const channelId = await createChannel(lecturer.id, `calendar-role-match-${Date.now()}`);
    const id = await createEvent(channelId, lecturer.id, `calendar-role-event-${Date.now()}`);

    const ghostStudentToken = signJwt({
      id: crypto.randomUUID(),
      email: `ghost_student_${Date.now()}@co.za`,
      role: "STUDENT",
    });

    const channelEventsRes = await request(app).get(`/api/channels/${channelId}/events`).set(auth(ghostStudentToken));
    expect(channelEventsRes.status).toBe(200);
    const channelEvents = extractList(channelEventsRes.body);
    expect(Array.isArray(channelEvents)).toBe(true);
    expect(channelEvents.some((x: any) => String(x?.id ?? "") === id)).toBe(true);

    const calendarRes = await request(app).get("/api/calendar").set(auth(ghostStudentToken));
    expect(calendarRes.status).toBe(200);
    expect(Array.isArray(calendarRes.body?.value)).toBe(true);
    expect(calendarRes.body.value.some((x: any) => String(x?.id ?? "") === id)).toBe(true);
  });
});
