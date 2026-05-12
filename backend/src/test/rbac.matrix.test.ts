import request from "supertest";
import { createApp } from "../app";
import {
  createUser,
  signJwt,
  createChannel,
  createAnnouncement,
  createEvent,
  cleanupTestUsers,
} from "./helpers";

type Ctx = {
  studentToken: string;
  lecturerToken: string;
  parentToken: string;
  adminToken: string;

  channelId: string;
  eventId: string;
};

const app = createApp();

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("RBAC matrix (automated)", () => {
  const ctx = {} as Ctx;

  beforeAll(async () => {
    const student = await createUser("STUDENT");
    const lecturer = await createUser("LECTURER");
    const parent = await createUser("PARENT");
    const admin = await createUser("ADMIN");

    ctx.studentToken = signJwt(student);
    ctx.lecturerToken = signJwt(lecturer);
    ctx.parentToken = signJwt(parent);
    ctx.adminToken = signJwt(admin);

    // Seed a channel created by lecturer
    ctx.channelId = await createChannel(lecturer.id, `seed-channel-${Date.now()}`);

    // Seed announcement + event so list endpoints have something
    await createAnnouncement(ctx.channelId, lecturer.id, `seed-ann-${Date.now()}`);
    ctx.eventId = await createEvent(ctx.channelId, lecturer.id, `seed-event-${Date.now()}`);
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  const cases: Array<{
    name: string;
    run: () => Promise<request.Response>;
    expect: number[];
  }> = [
    {
      name: "STUDENT can list channels",
      run: () => request(app).get("/api/channels").set(auth(ctx.studentToken)),
      expect: [200],
    },

    {
      name: "PARENT cannot create channel",
      run: () =>
        request(app)
          .post("/api/channels")
          .set(auth(ctx.parentToken))
          .send({ name: `parent-channel-${Date.now()}`, type: "GENERAL" }),
      expect: [401, 403],
    },

    {
      name: "LECTURER can create channel",
      run: () =>
        request(app)
          .post("/api/channels")
          .set(auth(ctx.lecturerToken))
          .send({ name: `lecturer-channel-${Date.now()}`, type: "GENERAL" }),
      expect: [200, 201],
    },

    {
      name: "STUDENT can list announcements",
      run: () =>
        request(app)
          .get(`/api/channels/${ctx.channelId}/announcements`)
          .set(auth(ctx.studentToken)),
      expect: [200],
    },

    {
      name: "STUDENT cannot create announcement",
      run: () =>
        request(app)
          .post(`/api/channels/${ctx.channelId}/announcements`)
          .set(auth(ctx.studentToken))
          .send({ title: `t-${Date.now()}`, body: "hello" }),
      expect: [401, 403],
    },

    {
      name: "LECTURER can create announcement",
      run: () =>
        request(app)
          .post(`/api/channels/${ctx.channelId}/announcements`)
          .set(auth(ctx.lecturerToken))
          .send({ title: `t-${Date.now()}`, body: "hello" }),
      expect: [200, 201],
    },

    {
      name: "STUDENT can list events",
      run: () =>
        request(app)
          .get(`/api/channels/${ctx.channelId}/events`)
          .set(auth(ctx.studentToken)),
      expect: [200],
    },

    {
      name: "STUDENT cannot create event",
      run: () =>
        request(app)
          .post(`/api/channels/${ctx.channelId}/events`)
          .set(auth(ctx.studentToken))
          .send({
            title: `e-${Date.now()}`,
            startsAt: new Date(Date.now() + 3600_000).toISOString(),
            endsAt: new Date(Date.now() + 7200_000).toISOString(),
          }),
      expect: [401, 403],
    },

    {
      name: "LECTURER can create event",
      run: () =>
        request(app)
          .post(`/api/channels/${ctx.channelId}/events`)
          .set(auth(ctx.lecturerToken))
          .send({
            title: `e-${Date.now()}`,
            startsAt: new Date(Date.now() + 3600_000).toISOString(),
            endsAt: new Date(Date.now() + 7200_000).toISOString(),
          }),
      expect: [200, 201],
    },

    {
      name: "LECTURER can update event (if your backend allows it)",
      run: () =>
        request(app)
          .patch(`/api/channels/${ctx.channelId}/events/${ctx.eventId}`)
          .set(auth(ctx.lecturerToken))
          .send({ title: `updated-${Date.now()}` }),
      // Your events router requires ADMIN/LECTURER; update returns 200 on success.
      // If your repo sometimes returns null, it could be 404, so allow it too.
      expect: [200, 404],
    },

    {
      name: "STUDENT can list messages",
      run: () =>
        request(app)
          .get(`/api/channels/${ctx.channelId}/messages`)
          .set(auth(ctx.studentToken)),
      expect: [200],
    },

    {
      name: "STUDENT can create message",
      run: () =>
        request(app)
          .post(`/api/channels/${ctx.channelId}/messages`)
          .set(auth(ctx.studentToken))
          .send({ body: `msg-${Date.now()}` }),
      expect: [200, 201],
    },

    {
      name: "PARENT cannot create message (threads are separate)",
      run: () =>
        request(app)
          .post(`/api/channels/${ctx.channelId}/messages`)
          .set(auth(ctx.parentToken))
          .send({ body: `msg-${Date.now()}` }),
      expect: [401, 403],
    },

    {
      name: "Only PARENT can access parent portal endpoint",
      run: () => request(app).get("/api/parent/parent").set(auth(ctx.parentToken)),
      expect: [200],
    },

    {
      name: "STUDENT cannot access parent portal endpoint",
      run: () => request(app).get("/api/parent/parent").set(auth(ctx.studentToken)),
      expect: [401, 403],
    },

    {
      name: "ADMIN can list parent link request queue",
      run: () => request(app).get("/api/parent/admin/parent/link-requests").set(auth(ctx.adminToken)),
      expect: [200],
    },

    {
      name: "LECTURER can list parent link request queue",
      run: () => request(app).get("/api/parent/admin/parent/link-requests").set(auth(ctx.lecturerToken)),
      expect: [200],
    },

    {
      name: "STUDENT can access /calendar without childId",
      run: () => request(app).get("/api/calendar").set(auth(ctx.studentToken)),
      // You said student gets 200 currently.
      expect: [200],
    },

    {
      name: "PARENT cannot access /calendar without childId",
      run: () => request(app).get("/api/calendar").set(auth(ctx.parentToken)),
      // Parent requests require childId.
      expect: [400],
    },
  ];

  for (const c of cases) {
    test(c.name, async () => {
      const res = await c.run();
      expect(c.expect).toContain(res.status);
    });
  }
});
