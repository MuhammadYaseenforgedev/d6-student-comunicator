import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../config/db";
import { requireRole } from "../middleware/rbac";

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function demoSeedEnabled(): boolean {
  return String(process.env.DEMO_SEED_ENABLED ?? "").trim().toLowerCase() === "true";
}

type Queryable = {
  query: <T>(text: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

type DemoUserInput = {
  email: string;
  role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";
  firstName: string;
  lastName: string;
  courseName: string | null;
  publicStudentId?: string | null;
};

async function upsertDemoUser(
  client: Queryable,
  passwordHash: string,
  input: DemoUserInput
): Promise<string> {
  const row = await client.query<{ id: string }>(
    `
      INSERT INTO users (
        email,
        password_hash,
        role,
        first_name,
        last_name,
        course_name,
        public_student_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (email)
      DO UPDATE SET
        role = EXCLUDED.role,
        first_name = CASE
          WHEN users.first_name IS NULL OR btrim(users.first_name) = '' THEN EXCLUDED.first_name
          ELSE users.first_name
        END,
        last_name = CASE
          WHEN users.last_name IS NULL OR btrim(users.last_name) = '' THEN EXCLUDED.last_name
          ELSE users.last_name
        END,
        course_name = CASE
          WHEN users.course_name IS NULL OR btrim(users.course_name) = '' THEN EXCLUDED.course_name
          ELSE users.course_name
        END,
        public_student_id = CASE
          WHEN users.public_student_id IS NULL OR btrim(users.public_student_id) = '' THEN EXCLUDED.public_student_id
          ELSE users.public_student_id
        END
      RETURNING id
    `,
    [
      input.email,
      passwordHash,
      input.role,
      input.firstName,
      input.lastName,
      input.courseName,
      input.publicStudentId ?? null,
    ]
  );

  return row.rows[0].id;
}

type CoreDemoUserInput = {
  email: string;
  role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";
  firstName: string;
  lastName: string;
  courseName?: string | null;
};

async function ensureCoreDemoUser(
  client: Queryable,
  passwordHash: string,
  input: CoreDemoUserInput
): Promise<{ id: string; created: boolean }> {
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO users (email, password_hash, role, first_name, last_name, course_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `,
    [input.email, passwordHash, input.role, input.firstName, input.lastName, input.courseName ?? null]
  );

  if ((inserted.rowCount ?? 0) > 0) {
    return { id: inserted.rows[0].id, created: true };
  }

  const existing = await client.query<{ id: string }>(
    `
      SELECT id
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [input.email]
  );

  const id = existing.rows[0].id;

  await client.query(
    `
      UPDATE users
      SET
        role = $2,
        first_name = COALESCE(NULLIF(btrim(first_name), ''), $3),
        last_name = COALESCE(NULLIF(btrim(last_name), ''), $4),
        course_name = COALESCE(NULLIF(btrim(course_name), ''), $5)
      WHERE id = $1
    `,
    [id, input.role, input.firstName, input.lastName, input.courseName ?? null]
  );

  return { id, created: false };
}

async function insertByIdOrTouch(
  client: Queryable,
  insertSql: string,
  insertParams: unknown[],
  touchSql: string,
  touchParams: unknown[]
): Promise<boolean> {
  const inserted = await client.query<{ id: string }>(insertSql, insertParams);
  const created = (inserted.rowCount ?? 0) > 0;
  if (!created) {
    await client.query(touchSql, touchParams);
  }
  return created;
}

export const demoRouter = Router();

// POST /api/demo/seed-attendance
demoRouter.post("/seed-attendance", requireRole("ADMIN"), async (_req, res) => {
  if (!demoSeedEnabled()) {
    return err(res, 404, "NOT_FOUND", "Route not found");
  }

  const FACULTY_NAME = "Demo Faculty";
  const MODULE_CODE = "DEMO-CS101";
  const MODULE_NAME = "Demo Intro to CS";
  const LECTURER_EMAIL = "demo+lecturer@local.test";
  const STUDENT_1_EMAIL = "demo+student1@local.test";
  const STUDENT_2_EMAIL = "demo+student2@local.test";
  const todayUtc = new Date().toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const passwordHash = await bcrypt.hash("DemoPassw0rd!", 10);

    const faculty = await client.query<{ id: string }>(
      `
        INSERT INTO faculties (name)
        VALUES ($1)
        ON CONFLICT (name)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `,
      [FACULTY_NAME]
    );
    const facultyId = faculty.rows[0].id;

    const moduleRes = await client.query<{ id: string }>(
      `
        INSERT INTO faculty_modules (faculty_id, code, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (code)
        DO UPDATE SET
          faculty_id = EXCLUDED.faculty_id,
          name = EXCLUDED.name
        RETURNING id
      `,
      [facultyId, MODULE_CODE, MODULE_NAME]
    );
    const moduleId = moduleRes.rows[0].id;

    const lecturerId = await upsertDemoUser(client, passwordHash, {
      email: LECTURER_EMAIL,
      role: "LECTURER",
      firstName: "Demo",
      lastName: "Lecturer",
      courseName: null,
      publicStudentId: null,
    });

    const student1Id = await upsertDemoUser(client, passwordHash, {
      email: STUDENT_1_EMAIL,
      role: "STUDENT",
      firstName: "Demo",
      lastName: "Student One",
      courseName: "Demo Intro to CS",
      publicStudentId: "DEMO-STUDENT-1",
    });

    const student2Id = await upsertDemoUser(client, passwordHash, {
      email: STUDENT_2_EMAIL,
      role: "STUDENT",
      firstName: "Demo",
      lastName: "Student Two",
      courseName: "Demo Intro to CS",
      publicStudentId: "DEMO-STUDENT-2",
    });

    await client.query(
      `
        INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
        VALUES ($1, $2)
        ON CONFLICT (module_id, lecturer_id) DO NOTHING
      `,
      [moduleId, lecturerId]
    );

    await client.query(
      `
        INSERT INTO student_module_enrollments (module_id, student_id)
        VALUES ($1, $2), ($1, $3)
        ON CONFLICT (module_id, student_id) DO NOTHING
      `,
      [moduleId, student1Id, student2Id]
    );

    const existingSession = await client.query<{ id: string }>(
      `
        SELECT id
        FROM attendance_sessions
        WHERE lecturer_id = $1
          AND module_id = $2
          AND attendance_date = $3::date
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [lecturerId, moduleId, todayUtc]
    );

    let sessionId = existingSession.rows[0]?.id ?? "";
    if (!sessionId) {
      const createdSession = await client.query<{ id: string }>(
        `
          INSERT INTO attendance_sessions (lecturer_id, module_id, attendance_date, created_by)
          VALUES ($1, $2, $3::date, $1)
          RETURNING id
        `,
        [lecturerId, moduleId, todayUtc]
      );
      sessionId = createdSession.rows[0].id;
    }

    const marked: Array<{ studentId: string; status: "PRESENT" | "ABSENT" }> = [];
    const seedMarks: Array<{ studentId: string; status: "PRESENT" | "ABSENT" }> = [
      { studentId: student1Id, status: "PRESENT" },
      { studentId: student2Id, status: "ABSENT" },
    ];

    for (const mark of seedMarks) {
      await client.query(
        `
          INSERT INTO attendance_records (session_id, student_id, status, marked_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (session_id, student_id)
          DO UPDATE SET
            status = EXCLUDED.status,
            marked_at = now(),
            marked_by = EXCLUDED.marked_by
        `,
        [sessionId, mark.studentId, mark.status, lecturerId]
      );
      marked.push(mark);
    }

    await client.query("COMMIT");

    return res.status(200).json({
      moduleId,
      lecturerId,
      studentIds: [student1Id, student2Id],
      sessionId,
      marked,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[demo] POST /demo/seed-attendance error", e);
    return err(res, 500, "INTERNAL", "Failed to seed attendance demo");
  } finally {
    client.release();
  }
});

// POST /api/demo/seed-core
demoRouter.post("/seed-core", requireRole("ADMIN"), async (_req, res) => {
  if (!demoSeedEnabled()) {
    return err(res, 404, "NOT_FOUND", "Route not found");
  }

  const passwordHash = await bcrypt.hash("DemoPass123", 10);

  const userDefs: CoreDemoUserInput[] = [
    {
      email: "muhammadyaseenw2+student@gmail.com",
      role: "STUDENT",
      firstName: "Muhammad",
      lastName: "Student",
      courseName: "Demo Intro to CS",
    },
    {
      email: "muhammadyaseenw2+lecturer@gmail.com",
      role: "LECTURER",
      firstName: "Muhammad",
      lastName: "Lecturer",
      courseName: null,
    },
    {
      email: "muhammadyaseenw2+admin@gmail.com",
      role: "ADMIN",
      firstName: "Muhammad",
      lastName: "Admin",
      courseName: null,
    },
    {
      email: "muhammadyaseenw2+parent@gmail.com",
      role: "PARENT",
      firstName: "Muhammad",
      lastName: "Parent",
      courseName: null,
    },
  ];

  const channelDefs: Array<{ id: string; name: string; type: "CLUB" | "FACULTY" | "MODULE" | "EMERGENCY" }> = [
    { id: "10000000-0000-4000-8000-000000000011", name: "Clubs", type: "CLUB" },
    { id: "10000000-0000-4000-8000-000000000012", name: "Faculty", type: "FACULTY" },
    { id: "10000000-0000-4000-8000-000000000013", name: "Modules", type: "MODULE" },
    { id: "10000000-0000-4000-8000-000000000014", name: "Emergency", type: "EMERGENCY" },
  ];

  const calendarDefs: Array<{
    id: string;
    title: string;
    description: string;
    location: string;
    startsAt: string;
    endsAt: string;
  }> = [
    {
      id: "10000000-0000-4000-8000-000000000031",
      title: "Demo CS Lecture",
      description: "Introduction to demo module topics",
      location: "Room A1",
      startsAt: "2026-03-03T08:00:00.000Z",
      endsAt: "2026-03-03T09:30:00.000Z",
    },
    {
      id: "10000000-0000-4000-8000-000000000032",
      title: "Demo Tutorial",
      description: "Hands-on coding tutorial",
      location: "Lab B2",
      startsAt: "2026-03-05T10:00:00.000Z",
      endsAt: "2026-03-05T11:00:00.000Z",
    },
  ];

  const threadDefs: Array<{
    id: string;
    createdByEmail: string;
    participantEmails: [string, string];
    messages: Array<{ id: string; body: string; createdByEmail: string }>;
  }> = [
    {
      id: "10000000-0000-4000-8000-000000000021",
      createdByEmail: "muhammadyaseenw2+student@gmail.com",
      participantEmails: ["muhammadyaseenw2+student@gmail.com", "muhammadyaseenw2+lecturer@gmail.com"],
      messages: [
        {
          id: "10000000-0000-4000-8000-000000000041",
          body: "Hi lecturer, I need help with the demo module.",
          createdByEmail: "muhammadyaseenw2+student@gmail.com",
        },
        {
          id: "10000000-0000-4000-8000-000000000042",
          body: "Sure, let's review it during office hours.",
          createdByEmail: "muhammadyaseenw2+lecturer@gmail.com",
        },
      ],
    },
    {
      id: "10000000-0000-4000-8000-000000000022",
      createdByEmail: "muhammadyaseenw2+student@gmail.com",
      participantEmails: ["muhammadyaseenw2+student@gmail.com", "muhammadyaseenw2+admin@gmail.com"],
      messages: [
        {
          id: "10000000-0000-4000-8000-000000000043",
          body: "Admin, can you confirm my enrollment details?",
          createdByEmail: "muhammadyaseenw2+student@gmail.com",
        },
        {
          id: "10000000-0000-4000-8000-000000000044",
          body: "Confirmed. Your demo records are active.",
          createdByEmail: "muhammadyaseenw2+admin@gmail.com",
        },
      ],
    },
    {
      id: "10000000-0000-4000-8000-000000000023",
      createdByEmail: "muhammadyaseenw2+parent@gmail.com",
      participantEmails: ["muhammadyaseenw2+parent@gmail.com", "muhammadyaseenw2+admin@gmail.com"],
      messages: [
        {
          id: "10000000-0000-4000-8000-000000000045",
          body: "Hello admin, I need an attendance update.",
          createdByEmail: "muhammadyaseenw2+parent@gmail.com",
        },
        {
          id: "10000000-0000-4000-8000-000000000046",
          body: "Update shared. Check the parent attendance page.",
          createdByEmail: "muhammadyaseenw2+admin@gmail.com",
        },
      ],
    },
  ];

  const uploadDef = {
    id: "10000000-0000-4000-8000-000000000051",
    kind: "STUDENT_SUBMISSION",
    originalName: "demo-student-submission.txt",
    mimeType: "text/plain",
    sizeBytes: 128,
    storagePath: "demo/demo-student-submission.txt",
  } as const;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userIdsByEmail = new Map<string, string>();
    for (const def of userDefs) {
      const ensured = await ensureCoreDemoUser(client, passwordHash, def);
      userIdsByEmail.set(def.email.toLowerCase(), ensured.id);
    }

    const adminId = userIdsByEmail.get("muhammadyaseenw2+admin@gmail.com")!;
    const studentId = userIdsByEmail.get("muhammadyaseenw2+student@gmail.com")!;

    let createdChannels = 0;
    for (const channel of channelDefs) {
      const created = await insertByIdOrTouch(
        client,
        `
          INSERT INTO channels (id, name, type, is_private, created_by)
          VALUES ($1, $2, $3, false, $4)
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `,
        [channel.id, channel.name, channel.type, adminId],
        `
          UPDATE channels
          SET name = $2,
              type = $3,
              is_private = false
          WHERE id = $1
        `,
        [channel.id, channel.name, channel.type]
      );
      if (created) createdChannels += 1;

      await client.query(
        `
          INSERT INTO channel_members (channel_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT (channel_id, user_id) DO NOTHING
        `,
        [channel.id, adminId]
      );
    }

    let createdThreads = 0;
    let createdMessages = 0;
    for (const thread of threadDefs) {
      const createdBy = userIdsByEmail.get(thread.createdByEmail.toLowerCase());
      if (!createdBy) throw new Error(`Missing seeded user: ${thread.createdByEmail}`);

      const createdThread = await insertByIdOrTouch(
        client,
        `
          INSERT INTO threads (id, created_by)
          VALUES ($1, $2)
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `,
        [thread.id, createdBy],
        `
          UPDATE threads
          SET created_by = $2
          WHERE id = $1
        `,
        [thread.id, createdBy]
      );
      if (createdThread) createdThreads += 1;

      for (const p of thread.participantEmails) {
        const pid = userIdsByEmail.get(p.toLowerCase());
        if (!pid) throw new Error(`Missing seeded user: ${p}`);
        await client.query(
          `
            INSERT INTO thread_participants (thread_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT (thread_id, user_id) DO NOTHING
          `,
          [thread.id, pid]
        );
      }

      for (const message of thread.messages) {
        const createdByUserId = userIdsByEmail.get(message.createdByEmail.toLowerCase());
        if (!createdByUserId) throw new Error(`Missing seeded user: ${message.createdByEmail}`);

        const createdMessage = await insertByIdOrTouch(
          client,
          `
            INSERT INTO thread_messages (id, thread_id, body, created_by)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO NOTHING
            RETURNING id
          `,
          [message.id, thread.id, message.body, createdByUserId],
          `
            UPDATE thread_messages
            SET thread_id = $2,
                body = $3,
                created_by = $4
            WHERE id = $1
          `,
          [message.id, thread.id, message.body, createdByUserId]
        );
        if (createdMessage) createdMessages += 1;
      }
    }

    let createdCalendarEntries = 0;
    for (const entry of calendarDefs) {
      const createdCalendar = await insertByIdOrTouch(
        client,
        `
          INSERT INTO calendar_entries (id, user_id, title, description, location, starts_at, ends_at)
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `,
        [entry.id, studentId, entry.title, entry.description, entry.location, entry.startsAt, entry.endsAt],
        `
          UPDATE calendar_entries
          SET user_id = $2,
              title = $3,
              description = $4,
              location = $5,
              starts_at = $6::timestamptz,
              ends_at = $7::timestamptz
          WHERE id = $1
        `,
        [entry.id, studentId, entry.title, entry.description, entry.location, entry.startsAt, entry.endsAt]
      );
      if (createdCalendar) createdCalendarEntries += 1;
    }

    const createdUpload = await insertByIdOrTouch(
      client,
      `
        INSERT INTO uploads (id, kind, original_name, mime_type, size_bytes, storage_path, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `,
      [
        uploadDef.id,
        uploadDef.kind,
        uploadDef.originalName,
        uploadDef.mimeType,
        uploadDef.sizeBytes,
        uploadDef.storagePath,
        studentId,
      ],
      `
        UPDATE uploads
        SET kind = $2,
            original_name = $3,
            mime_type = $4,
            size_bytes = $5,
            storage_path = $6,
            uploaded_by = $7
        WHERE id = $1
      `,
      [
        uploadDef.id,
        uploadDef.kind,
        uploadDef.originalName,
        uploadDef.mimeType,
        uploadDef.sizeBytes,
        uploadDef.storagePath,
        studentId,
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      channels: { count: createdChannels, ids: channelDefs.map((c) => c.id) },
      threads: { count: createdThreads, ids: threadDefs.map((t) => t.id) },
      messages: { count: createdMessages, ids: threadDefs.flatMap((t) => t.messages.map((m) => m.id)) },
      calendarEntries: { count: createdCalendarEntries, ids: calendarDefs.map((c) => c.id) },
      uploads: { count: createdUpload ? 1 : 0, ids: [uploadDef.id] },
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[demo] POST /demo/seed-core error", e);
    return err(res, 500, "INTERNAL", "Failed to seed demo core data");
  } finally {
    client.release();
  }
});
