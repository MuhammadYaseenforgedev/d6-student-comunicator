import request from "supertest";
import { app } from "../app";
import { cleanupTestUsers, createChannel, createUser, signJwt } from "./helpers";

type Ctx = {
  adminToken: string;
  lecturerToken: string;
  studentToken: string;
  parentToken: string;
  channelId: string;
  announcementId: string;
  uploadId: string;
  adminUploadId: string;
  studentUploadId: string;
};

type UploadListRow = {
  id?: string;
};

function toRows(body: unknown): UploadListRow[] {
  if (Array.isArray(body)) return body as UploadListRow[];
  if (body && typeof body === "object" && Array.isArray((body as { value?: unknown }).value)) {
    return (body as { value: UploadListRow[] }).value;
  }
  return [];
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Announcements and uploads permissions", () => {
  const ctx = {} as Ctx;

  beforeAll(async () => {
    const admin = await createUser("ADMIN");
    const lecturer = await createUser("LECTURER");
    const student = await createUser("STUDENT");
    const parent = await createUser("PARENT");

    ctx.adminToken = signJwt(admin);
    ctx.lecturerToken = signJwt(lecturer);
    ctx.studentToken = signJwt(student);
    ctx.parentToken = signJwt(parent);

    ctx.channelId = await createChannel(lecturer.id, `ann-upload-${Date.now()}`);
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  test("Parent and student can view announcements", async () => {
    const created = await request(app)
      .post(`/api/channels/${ctx.channelId}/announcements`)
      .set(auth(ctx.lecturerToken))
      .send({ title: `notice-${Date.now()}`, body: "body" });
    expect(created.status).toBe(201);
    ctx.announcementId = String(created.body?.id ?? "");
    expect(ctx.announcementId).toBeTruthy();

    const parentList = await request(app)
      .get(`/api/channels/${ctx.channelId}/announcements`)
      .set(auth(ctx.parentToken));
    expect(parentList.status).toBe(200);

    const studentList = await request(app)
      .get(`/api/channels/${ctx.channelId}/announcements`)
      .set(auth(ctx.studentToken));
    expect(studentList.status).toBe(200);
  });

  test("Lecturer and admin can edit/delete announcements; parent/student cannot", async () => {
    const lecturerEdit = await request(app)
      .patch(`/api/channels/${ctx.channelId}/announcements/${ctx.announcementId}`)
      .set(auth(ctx.lecturerToken))
      .send({ title: `edited-${Date.now()}` });
    expect(lecturerEdit.status).toBe(200);

    const parentEdit = await request(app)
      .patch(`/api/channels/${ctx.channelId}/announcements/${ctx.announcementId}`)
      .set(auth(ctx.parentToken))
      .send({ title: `deny-${Date.now()}` });
    expect([401, 403]).toContain(parentEdit.status);

    const studentDelete = await request(app)
      .delete(`/api/channels/${ctx.channelId}/announcements/${ctx.announcementId}`)
      .set(auth(ctx.studentToken));
    expect([401, 403]).toContain(studentDelete.status);

    const adminDelete = await request(app)
      .delete(`/api/channels/${ctx.channelId}/announcements/${ctx.announcementId}`)
      .set(auth(ctx.adminToken));
    expect(adminDelete.status).toBe(200);
  });

  test("Uploads: student can submit; parent is forbidden; list/download visibility is role-safe", async () => {
    const lecturerUpload = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.lecturerToken))
      .field("kind", "LECTURER_MATERIAL")
      .attach("file", Buffer.from("lecturer material"), "guide.txt");
    expect(lecturerUpload.status).toBe(201);
    ctx.uploadId = String(lecturerUpload.body?.id ?? "");
    expect(ctx.uploadId).toBeTruthy();

    const adminUpload = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.adminToken))
      .field("kind", "LECTURER_MATERIAL")
      .attach("file", Buffer.from("admin material"), "admin-guide.txt");
    expect(adminUpload.status).toBe(201);
    ctx.adminUploadId = String(adminUpload.body?.id ?? "");
    expect(ctx.adminUploadId).toBeTruthy();

    const parentUpload = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.parentToken))
      .field("kind", "LECTURER_MATERIAL")
      .attach("file", Buffer.from("parent"), "parent.txt");
    expect(parentUpload.status).toBe(403);
    expect(String(parentUpload.body?.error ?? "")).toMatch(/forbidden/i);

    const studentUpload = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.studentToken))
      .field("kind", "STUDENT_SUBMISSION")
      .attach("file", Buffer.from("student submission"), "student-submission.txt");
    expect(studentUpload.status).toBe(201);
    ctx.studentUploadId = String(studentUpload.body?.id ?? "");
    expect(ctx.studentUploadId).toBeTruthy();

    const studentWrongKind = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.studentToken))
      .field("kind", "LECTURER_MATERIAL")
      .attach("file", Buffer.from("student wrong kind"), "student-wrong-kind.txt");
    expect(studentWrongKind.status).toBe(400);

    const lecturerList = await request(app)
      .get("/api/uploads")
      .set(auth(ctx.lecturerToken));
    expect(lecturerList.status).toBe(200);
    const lecturerRows = toRows(lecturerList.body);
    expect(lecturerRows.some((x) => String(x.id) === ctx.studentUploadId)).toBe(true);

    const parentList = await request(app)
      .get("/api/uploads")
      .set(auth(ctx.parentToken));
    expect(parentList.status).toBe(200);
    const parentRows = toRows(parentList.body);
    expect(parentRows.some((x) => String(x.id) === ctx.uploadId)).toBe(true);
    expect(parentRows.some((x) => String(x.id) === ctx.adminUploadId)).toBe(true);
    expect(parentRows.some((x) => String(x.id) === ctx.studentUploadId)).toBe(false);

    const studentList = await request(app)
      .get("/api/uploads")
      .set(auth(ctx.studentToken));
    expect(studentList.status).toBe(200);
    const studentRows = toRows(studentList.body);
    expect(studentRows.some((x) => String(x.id) === ctx.uploadId)).toBe(true);
    expect(studentRows.some((x) => String(x.id) === ctx.adminUploadId)).toBe(true);
    expect(studentRows.some((x) => String(x.id) === ctx.studentUploadId)).toBe(true);

    const parentDownload = await request(app)
      .get(`/api/uploads/${ctx.uploadId}/download`)
      .set(auth(ctx.parentToken));
    expect(parentDownload.status).toBe(200);

    const parentDownloadStudent = await request(app)
      .get(`/api/uploads/${ctx.studentUploadId}/download`)
      .set(auth(ctx.parentToken));
    expect(parentDownloadStudent.status).toBe(403);

    const studentDownload = await request(app)
      .get(`/api/uploads/${ctx.uploadId}/download`)
      .set(auth(ctx.studentToken));
    expect(studentDownload.status).toBe(200);

    const studentOwnDownload = await request(app)
      .get(`/api/uploads/${ctx.studentUploadId}/download`)
      .set(auth(ctx.studentToken));
    expect(studentOwnDownload.status).toBe(200);

    const adminDownloadStudent = await request(app)
      .get(`/api/uploads/${ctx.studentUploadId}/download`)
      .set(auth(ctx.adminToken));
    expect(adminDownloadStudent.status).toBe(200);

    const parentDelete = await request(app)
      .delete(`/api/uploads/${ctx.uploadId}`)
      .set(auth(ctx.parentToken));
    expect([401, 403]).toContain(parentDelete.status);

    const studentDelete = await request(app)
      .delete(`/api/uploads/${ctx.studentUploadId}`)
      .set(auth(ctx.studentToken));
    expect([401, 403]).toContain(studentDelete.status);

    const lecturerDelete = await request(app)
      .delete(`/api/uploads/${ctx.uploadId}`)
      .set(auth(ctx.lecturerToken));
    expect(lecturerDelete.status).toBe(200);

    const lecturerDeleteStudentUpload = await request(app)
      .delete(`/api/uploads/${ctx.studentUploadId}`)
      .set(auth(ctx.lecturerToken));
    expect(lecturerDeleteStudentUpload.status).toBe(200);
  });
});
