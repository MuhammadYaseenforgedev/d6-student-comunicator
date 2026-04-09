import request from "supertest";
import { app } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createChannel, createUser, signJwt } from "./helpers";

type Ctx = {
  adminToken: string;
  financeAdminToken: string;
  lecturerToken: string;
  studentToken: string;
  otherStudentToken: string;
  parentToken: string;
  parentId: string;
  lecturerId: string;
  studentId: string;
  otherStudentId: string;
  channelId: string;
  announcementId: string;
  uploadId: string;
  adminUploadId: string;
  adminStudentUploadId: string;
  studentUploadId: string;
  otherStudentUploadId: string;
  modulesChannelId: string;
  courseId: string;
  facultyId: string;
  moduleId: string;
  otherModuleId: string;
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
    const financeAdmin = await createUser("ADMIN", undefined, "Passw0rd!", "FINANCE");
    const lecturer = await createUser("LECTURER");
    const student = await createUser("STUDENT");
    const otherStudent = await createUser("STUDENT");
    const parent = await createUser("PARENT");

    ctx.adminToken = signJwt(admin);
    ctx.financeAdminToken = signJwt(financeAdmin);
    ctx.lecturerToken = signJwt(lecturer);
    ctx.studentToken = signJwt(student);
    ctx.otherStudentToken = signJwt(otherStudent);
    ctx.parentToken = signJwt(parent);
    ctx.parentId = parent.id;
    ctx.lecturerId = lecturer.id;
    ctx.studentId = student.id;
    ctx.otherStudentId = otherStudent.id;

    ctx.channelId = await createChannel(lecturer.id, `ann-upload-${Date.now()}`);

    const modulesChannelRes = await pool.query<{ id: string }>(
      `
        INSERT INTO channels (name, type, is_private, created_by)
        VALUES ('Modules', 'MODULE', false, $1)
        RETURNING id
      `,
      [admin.id]
    );
    ctx.modulesChannelId = modulesChannelRes.rows[0].id;

    const courseRes = await pool.query<{ id: string }>(
      `
        INSERT INTO courses (code, name, description, is_active)
        VALUES ($1, $2, $3, true)
        RETURNING id
      `,
      [
        `TEST-COURSE-${Date.now()}`,
        "Test Course",
        "Test course for module announcement access",
      ]
    );
    ctx.courseId = courseRes.rows[0].id;

    const facultyRes = await pool.query<{ id: string }>(
      `
        INSERT INTO faculties (name)
        VALUES ($1)
        RETURNING id
      `,
      [`Test Faculty ${Date.now()}`]
    );
    ctx.facultyId = facultyRes.rows[0].id;

    const moduleRes = await pool.query<{ id: string }>(
      `
        INSERT INTO faculty_modules (faculty_id, course_id, code, name)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [ctx.facultyId, ctx.courseId, `TEST-MOD-${Date.now()}`, "Test Module"]
    );
    ctx.moduleId = moduleRes.rows[0].id;

    const otherModuleRes = await pool.query<{ id: string }>(
      `
        INSERT INTO faculty_modules (faculty_id, course_id, code, name)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [ctx.facultyId, ctx.courseId, `TEST-MOD-B-${Date.now()}`, "Other Test Module"]
    );
    ctx.otherModuleId = otherModuleRes.rows[0].id;

    await pool.query(
      `
        INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, lecturer_id) DO NOTHING
      `,
      [ctx.moduleId, ctx.lecturerId]
    );

    await pool.query(
      `
        INSERT INTO student_courses (student_user_id, course_id, status, enrolled_at)
        VALUES ($1, $2, 'ACTIVE', now())
        ON CONFLICT (student_user_id, course_id)
        DO UPDATE SET status = 'ACTIVE'
      `,
      [ctx.studentId, ctx.courseId]
    );

    await pool.query(
      `
        INSERT INTO student_courses (student_user_id, course_id, status, enrolled_at)
        VALUES ($1, $2, 'ACTIVE', now())
        ON CONFLICT (student_user_id, course_id)
        DO UPDATE SET status = 'ACTIVE'
      `,
      [ctx.otherStudentId, ctx.courseId]
    );

    await pool.query(
      `
        INSERT INTO student_module_enrollments (module_id, student_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, student_id) DO NOTHING
      `,
      [ctx.moduleId, ctx.studentId]
    );

    await pool.query(
      `
        INSERT INTO student_module_enrollments (module_id, student_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, student_id) DO NOTHING
      `,
      [ctx.otherModuleId, ctx.otherStudentId]
    );
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM lecturer_module_assignments WHERE module_id = ANY($1::uuid[])`,
      [[ctx.moduleId, ctx.otherModuleId]]
    );
    await pool.query(
      `DELETE FROM student_module_enrollments WHERE module_id = ANY($1::uuid[])`,
      [[ctx.moduleId, ctx.otherModuleId]]
    );
    await pool.query(`DELETE FROM faculty_modules WHERE id = ANY($1::uuid[])`, [
      [ctx.moduleId, ctx.otherModuleId],
    ]);
    await pool.query(`DELETE FROM student_courses WHERE course_id = $1`, [ctx.courseId]);
    await pool.query(`DELETE FROM courses WHERE id = $1`, [ctx.courseId]);
    await pool.query(`DELETE FROM faculties WHERE id = $1`, [ctx.facultyId]);
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

  test("Module announcements are scoped to linked modules", async () => {
    const allowedCreate = await request(app)
      .post(`/api/channels/${ctx.modulesChannelId}/announcements`)
      .set(auth(ctx.lecturerToken))
      .send({
        title: `module-ann-${Date.now()}`,
        body: "Module-specific notice",
        moduleId: ctx.moduleId,
      });
    expect(allowedCreate.status).toBe(201);
    expect(String(allowedCreate.body?.moduleId ?? "")).toBe(ctx.moduleId);

    const blockedLecturerCreate = await request(app)
      .post(`/api/channels/${ctx.modulesChannelId}/announcements`)
      .set(auth(ctx.lecturerToken))
      .send({
        title: `blocked-module-ann-${Date.now()}`,
        body: "Should not post",
        moduleId: ctx.otherModuleId,
      });
    expect(blockedLecturerCreate.status).toBe(403);

    const blockedFinanceAdminCreate = await request(app)
      .post(`/api/channels/${ctx.modulesChannelId}/announcements`)
      .set(auth(ctx.financeAdminToken))
      .send({
        title: `finance-module-ann-${Date.now()}`,
        body: "Should not post",
        moduleId: ctx.moduleId,
      });
    expect(blockedFinanceAdminCreate.status).toBe(403);

    const studentAllowed = await request(app)
      .get(`/api/channels/${ctx.modulesChannelId}/announcements?moduleId=${ctx.moduleId}`)
      .set(auth(ctx.studentToken));
    expect(studentAllowed.status).toBe(200);
    const allowedRows = toRows(studentAllowed.body);
    expect(
      allowedRows.some((row) => String(row.id) === String(allowedCreate.body?.id ?? ""))
    ).toBe(true);

    const studentBlocked = await request(app)
      .get(`/api/channels/${ctx.modulesChannelId}/announcements?moduleId=${ctx.otherModuleId}`)
      .set(auth(ctx.studentToken));
    expect(studentBlocked.status).toBe(403);
  });

  test("Uploads: student can submit; parent is forbidden; list/download visibility is role-safe", async () => {
    await pool.query(
      `
        INSERT INTO parent_links (parent_user_id, student_user_id)
        VALUES ($1, $2)
        ON CONFLICT (parent_user_id, student_user_id) DO NOTHING
      `,
      [ctx.parentId, ctx.studentId]
    );

    const lecturerUpload = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.lecturerToken))
      .field("kind", "LECTURER_MATERIAL")
      .field("courseId", ctx.courseId)
      .field("moduleId", ctx.moduleId)
      .attach("file", Buffer.from("lecturer material"), "guide.txt");
    expect(lecturerUpload.status).toBe(201);
    ctx.uploadId = String(lecturerUpload.body?.id ?? "");
    expect(ctx.uploadId).toBeTruthy();
    expect(String(lecturerUpload.body?.moduleId ?? "")).toBe(ctx.moduleId);

    const adminUpload = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.adminToken))
      .field("kind", "LECTURER_MATERIAL")
      .field("courseId", ctx.courseId)
      .field("moduleId", ctx.moduleId)
      .attach("file", Buffer.from("admin material"), "admin-guide.txt");
    expect(adminUpload.status).toBe(201);
    ctx.adminUploadId = String(adminUpload.body?.id ?? "");
    expect(ctx.adminUploadId).toBeTruthy();
    expect(String(adminUpload.body?.moduleId ?? "")).toBe(ctx.moduleId);

    const adminStudentUpload = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.adminToken))
      .field("kind", "STUDENT_SUBMISSION")
      .field("targetUserId", ctx.studentId)
      .field("courseId", ctx.courseId)
      .field("moduleId", ctx.moduleId)
      .attach("file", Buffer.from("admin student submission"), "admin-student-submission.txt");
    expect(adminStudentUpload.status).toBe(201);
    ctx.adminStudentUploadId = String(adminStudentUpload.body?.id ?? "");
    expect(ctx.adminStudentUploadId).toBeTruthy();
    expect(String(adminStudentUpload.body?.moduleId ?? "")).toBe(ctx.moduleId);

    const adminMissingTarget = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.adminToken))
      .field("kind", "STUDENT_SUBMISSION")
      .field("courseId", ctx.courseId)
      .field("moduleId", ctx.moduleId)
      .attach("file", Buffer.from("missing target"), "missing-target.txt");
    expect(adminMissingTarget.status).toBe(400);

    const adminWrongStudentModule = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.adminToken))
      .field("kind", "STUDENT_SUBMISSION")
      .field("targetUserId", ctx.studentId)
      .field("courseId", ctx.courseId)
      .field("moduleId", ctx.otherModuleId)
      .attach("file", Buffer.from("wrong module"), "wrong-module.txt");
    expect(adminWrongStudentModule.status).toBe(400);

    const adminCourseMismatch = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.adminToken))
      .field("kind", "LECTURER_MATERIAL")
      .field("courseId", "11111111-1111-4111-8111-111111111111")
      .field("moduleId", ctx.moduleId)
      .attach("file", Buffer.from("mismatch"), "mismatch.txt");
    expect(adminCourseMismatch.status).toBe(400);

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
      .field("courseId", ctx.courseId)
      .field("moduleId", ctx.moduleId)
      .attach("file", Buffer.from("student submission"), "student-submission.txt");
    expect(studentUpload.status).toBe(201);
    ctx.studentUploadId = String(studentUpload.body?.id ?? "");
    expect(ctx.studentUploadId).toBeTruthy();
    expect(String(studentUpload.body?.moduleId ?? "")).toBe(ctx.moduleId);

    const otherStudentUpload = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.otherStudentToken))
      .field("kind", "STUDENT_SUBMISSION")
      .field("courseId", ctx.courseId)
      .field("moduleId", ctx.otherModuleId)
      .attach("file", Buffer.from("other student submission"), "other-student-submission.txt");
    expect(otherStudentUpload.status).toBe(201);
    ctx.otherStudentUploadId = String(otherStudentUpload.body?.id ?? "");
    expect(ctx.otherStudentUploadId).toBeTruthy();

    const studentWrongKind = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.studentToken))
      .field("kind", "LECTURER_MATERIAL")
      .field("courseId", ctx.courseId)
      .field("moduleId", ctx.moduleId)
      .attach("file", Buffer.from("student wrong kind"), "student-wrong-kind.txt");
    expect(studentWrongKind.status).toBe(400);

    const studentWrongModule = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.studentToken))
      .field("kind", "STUDENT_SUBMISSION")
      .field("courseId", ctx.courseId)
      .field("moduleId", ctx.otherModuleId)
      .attach("file", Buffer.from("student wrong module"), "student-wrong-module.txt");
    expect(studentWrongModule.status).toBe(403);

    const lecturerWrongModule = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.lecturerToken))
      .field("kind", "LECTURER_MATERIAL")
      .field("courseId", ctx.courseId)
      .field("moduleId", ctx.otherModuleId)
      .attach("file", Buffer.from("lecturer wrong module"), "lecturer-wrong-module.txt");
    expect(lecturerWrongModule.status).toBe(403);

    const lecturerList = await request(app)
      .get("/api/uploads")
      .set(auth(ctx.lecturerToken));
    expect(lecturerList.status).toBe(200);
    const lecturerRows = toRows(lecturerList.body);
    expect(lecturerRows.some((x) => String(x.id) === ctx.uploadId)).toBe(true);
    expect(lecturerRows.some((x) => String(x.id) === ctx.adminUploadId)).toBe(true);
    expect(lecturerRows.some((x) => String(x.id) === ctx.studentUploadId)).toBe(true);
    expect(lecturerRows.some((x) => String(x.id) === ctx.adminStudentUploadId)).toBe(true);
    expect(lecturerRows.some((x) => String(x.id) === ctx.otherStudentUploadId)).toBe(false);

    const parentList = await request(app)
      .get("/api/uploads")
      .set(auth(ctx.parentToken));
    expect(parentList.status).toBe(200);
    const parentRows = toRows(parentList.body);
    expect(parentRows.some((x) => String(x.id) === ctx.uploadId)).toBe(false);
    expect(parentRows.some((x) => String(x.id) === ctx.adminUploadId)).toBe(false);
    expect(parentRows.some((x) => String(x.id) === ctx.studentUploadId)).toBe(true);
    expect(parentRows.some((x) => String(x.id) === ctx.adminStudentUploadId)).toBe(true);
    expect(parentRows.some((x) => String(x.id) === ctx.otherStudentUploadId)).toBe(false);

    const studentList = await request(app)
      .get("/api/uploads")
      .set(auth(ctx.studentToken));
    expect(studentList.status).toBe(200);
    const studentRows = toRows(studentList.body);
    expect(studentRows.some((x) => String(x.id) === ctx.uploadId)).toBe(true);
    expect(studentRows.some((x) => String(x.id) === ctx.adminUploadId)).toBe(true);
    expect(studentRows.some((x) => String(x.id) === ctx.studentUploadId)).toBe(true);
    expect(studentRows.some((x) => String(x.id) === ctx.adminStudentUploadId)).toBe(true);
    expect(studentRows.some((x) => String(x.id) === ctx.otherStudentUploadId)).toBe(false);

    const lecturerBlockedModuleList = await request(app)
      .get(`/api/uploads?moduleId=${ctx.otherModuleId}`)
      .set(auth(ctx.lecturerToken));
    expect(lecturerBlockedModuleList.status).toBe(403);

    const studentBlockedModuleList = await request(app)
      .get(`/api/uploads?moduleId=${ctx.otherModuleId}`)
      .set(auth(ctx.studentToken));
    expect(studentBlockedModuleList.status).toBe(403);

    const parentDownload = await request(app)
      .get(`/api/uploads/${ctx.uploadId}/download`)
      .set(auth(ctx.parentToken));
    expect(parentDownload.status).toBe(403);

    const parentDownloadStudent = await request(app)
      .get(`/api/uploads/${ctx.studentUploadId}/download`)
      .set(auth(ctx.parentToken));
    expect(parentDownloadStudent.status).toBe(200);

    const parentDownloadAdminStudent = await request(app)
      .get(`/api/uploads/${ctx.adminStudentUploadId}/download`)
      .set(auth(ctx.parentToken));
    expect(parentDownloadAdminStudent.status).toBe(200);

    const parentDownloadOtherStudent = await request(app)
      .get(`/api/uploads/${ctx.otherStudentUploadId}/download`)
      .set(auth(ctx.parentToken));
    expect(parentDownloadOtherStudent.status).toBe(403);

    const studentDownload = await request(app)
      .get(`/api/uploads/${ctx.uploadId}/download`)
      .set(auth(ctx.studentToken));
    expect(studentDownload.status).toBe(200);

    const studentOwnDownload = await request(app)
      .get(`/api/uploads/${ctx.studentUploadId}/download`)
      .set(auth(ctx.studentToken));
    expect(studentOwnDownload.status).toBe(200);

    const studentAdminSubmissionDownload = await request(app)
      .get(`/api/uploads/${ctx.adminStudentUploadId}/download`)
      .set(auth(ctx.studentToken));
    expect(studentAdminSubmissionDownload.status).toBe(200);

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

    const lecturerDeleteAdminStudentUpload = await request(app)
      .delete(`/api/uploads/${ctx.adminStudentUploadId}`)
      .set(auth(ctx.lecturerToken));
    expect(lecturerDeleteAdminStudentUpload.status).toBe(200);

    const lecturerDeleteOtherStudentUpload = await request(app)
      .delete(`/api/uploads/${ctx.otherStudentUploadId}`)
      .set(auth(ctx.lecturerToken));
    expect(lecturerDeleteOtherStudentUpload.status).toBe(403);
  });

  test("Uploads: missing files are pruned from staff lists", async () => {
    const created = await request(app)
      .post("/api/uploads")
      .set(auth(ctx.lecturerToken))
      .field("kind", "LECTURER_MATERIAL")
      .field("courseId", ctx.courseId)
      .field("moduleId", ctx.moduleId)
      .attach("file", Buffer.from("temporary upload"), "transient.txt");
    expect(created.status).toBe(201);

    const uploadId = String(created.body?.id ?? "");
    expect(uploadId).toBeTruthy();
    await pool.query(`UPDATE uploads SET storage_path = $2 WHERE id = $1`, [
      uploadId,
      "uploads/missing-test-file.txt",
    ]);

    const list = await request(app)
      .get("/api/uploads")
      .set(auth(ctx.lecturerToken));
    expect(list.status).toBe(200);
    const rows = toRows(list.body);
    expect(rows.some((row) => String(row.id) === uploadId)).toBe(false);

    const dbRow = await pool.query(`SELECT 1 FROM uploads WHERE id = $1 LIMIT 1`, [uploadId]);
    expect(dbRow.rowCount).toBe(0);
  });
});
