#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

function loadEnv(projectRoot) {
  const explicit = String(process.env.ENV_FILE || "").trim();
  const candidates = [];

  if (explicit) {
    candidates.push(path.isAbsolute(explicit) ? explicit : path.resolve(projectRoot, explicit));
  } else {
    candidates.push(path.resolve(projectRoot, ".env"));
  }

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, override: false });
    return envPath;
  }

  dotenv.config();
  return null;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function utcAt(daysFromNow, hour, minute = 0) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0));
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString();
}

function dateOnly(daysFromNow) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

const DEMO_USERS = {
  admin: {
    email: "demo+admin@co.za",
    password: "DemoPass123",
    role: "ADMIN",
    adminScope: "SUPER",
    studentNumber: null,
    southAfricanId: null,
  },
  academicAdmin: {
    email: "demo+academic-admin@co.za",
    password: "DemoPass123",
    role: "ADMIN",
    adminScope: "ACADEMIC",
    studentNumber: null,
    southAfricanId: null,
  },
  financeAdmin: {
    email: "demo+finance-admin@co.za",
    password: "DemoPass123",
    role: "ADMIN",
    adminScope: "FINANCE",
    studentNumber: null,
    southAfricanId: null,
  },
  lecturer: {
    email: "demo+lecturer@co.za",
    password: "DemoPass123",
    role: "LECTURER",
    studentNumber: null,
    southAfricanId: null,
  },
  student1: {
    email: "demo+student1@replace-with-real-inbox.com",
    password: "DemoPass123",
    role: "STUDENT",
    studentNumber: "20231771",
    southAfricanId: "0101015009087",
  },
  parent: {
    email: "demo+parent@co.za",
    password: "DemoPass123",
    role: "PARENT",
    studentNumber: null,
    southAfricanId: null,
  },
  student2: {
    email: "demo+student2@replace-with-real-inbox.com",
    password: "DemoPass123",
    role: "STUDENT",
    studentNumber: "20231772",
    southAfricanId: "0101015009088",
  },
};

const RESULT_SEEDS = [
  { id: "e4ed8dca-22b0-4cec-a1b8-3ae2a5bf1101", subject: "Mathematics", score: 86, outOf: 100, date: "2026-03-01" },
  { id: "e4ed8dca-22b0-4cec-a1b8-3ae2a5bf1102", subject: "English", score: 79, outOf: 100, date: "2026-03-02" },
  { id: "e4ed8dca-22b0-4cec-a1b8-3ae2a5bf1103", subject: "Computer Science", score: 92, outOf: 100, date: "2026-03-03" },
  { id: "e4ed8dca-22b0-4cec-a1b8-3ae2a5bf1104", subject: "Life Sciences", score: 81, outOf: 100, date: "2026-03-04" },
];

const FINANCE_SEEDS = [
  {
    id: "7ac6f990-9e3a-4b04-babc-7f6a912f1101",
    amountCents: 250000,
    description: "DEMO SEED: Tuition Fee Term 1",
    occurredAt: utcAt(-20, 8, 0),
  },
  {
    id: "7ac6f990-9e3a-4b04-babc-7f6a912f1102",
    amountCents: 45000,
    description: "DEMO SEED: Statement 2026-01",
    occurredAt: utcAt(-15, 10, 30),
  },
  {
    id: "7ac6f990-9e3a-4b04-babc-7f6a912f1103",
    amountCents: 47000,
    description: "DEMO SEED: Statement 2026-02",
    occurredAt: utcAt(-8, 9, 15),
  },
  {
    id: "7ac6f990-9e3a-4b04-babc-7f6a912f1104",
    amountCents: -150000,
    description: "DEMO SEED: EFT Payment",
    occurredAt: utcAt(-5, 12, 0),
  },
];

const FINANCE_DOCUMENT_SEEDS = [
  {
    id: "7ac6f990-9e3a-4b04-babc-7f6a912f1201",
    type: "STATEMENT",
    title: "March fee statement",
    description: "Statement covering the March tuition balance.",
    amountCents: 145000,
    issuedAt: utcAt(-4, 8, 0),
  },
  {
    id: "7ac6f990-9e3a-4b04-babc-7f6a912f1202",
    type: "NOTICE",
    title: "Payment plan reminder",
    description: "Final installment is due before month end.",
    amountCents: 100000,
    issuedAt: utcAt(-2, 9, 30),
  },
];

const FINANCE_NOTIFICATION_SEEDS = [
  {
    id: "7ac6f990-9e3a-4b04-babc-7f6a912f1301",
    title: "Payment reminder",
    body: "Please settle the remaining March balance before month end.",
    severity: "WARNING",
  },
  {
    id: "7ac6f990-9e3a-4b04-babc-7f6a912f1302",
    title: "Statement published",
    body: "The latest statement is now available in the finance portal.",
    severity: "INFO",
  },
];

const CHANNEL_SEEDS = [
  { key: "general", name: "General", type: "MODULE", isPrivate: false },
  { key: "modules", name: "Modules", type: "MODULE", isPrivate: false },
  { key: "faculty", name: "Faculty", type: "FACULTY", isPrivate: false },
  { key: "clubs", name: "Clubs", type: "CLUB", isPrivate: false },
  { key: "emergency", name: "Emergency", type: "EMERGENCY", isPrivate: false },
];

const CHANNEL_ANNOUNCEMENT_SEEDS = [
  {
    channelKey: "general",
    title: "DEMO SEED: Welcome",
    body: "Welcome to the D6 Student Communicator production demo.",
    pinned: true,
  },
  {
    channelKey: "modules",
    title: "DEMO SEED: Module Briefing",
    body: "CS101 weekly briefing is available in the modules feed.",
    pinned: false,
  },
  {
    channelKey: "faculty",
    title: "DEMO SEED: Faculty Notice",
    body: "Faculty consultation hours are open this week.",
    pinned: false,
  },
  {
    channelKey: "clubs",
    title: "DEMO SEED: Clubs Signup",
    body: "Student clubs signup remains open until Friday.",
    pinned: false,
  },
  {
    channelKey: "emergency",
    title: "DEMO SEED: Safety Drill",
    body: "Campus safety drill is scheduled for next Tuesday.",
    pinned: false,
  },
];

const CHANNEL_MESSAGE_SEEDS = [
  { channelKey: "general", body: "DEMO SEED: Lecturer welcome message.", actor: "lecturer" },
  { channelKey: "general", body: "DEMO SEED: Student acknowledgement.", actor: "student1" },
  { channelKey: "modules", body: "DEMO SEED: Please review CS101 assignment scope.", actor: "lecturer" },
];

const CHANNEL_EVENT_SEEDS = [
  {
    channelKey: "general",
    title: "DEMO SEED: Parent Meeting",
    description: "Parent meeting for progress feedback.",
    location: "Main Hall",
    startsAt: utcAt(2, 18, 0),
    endsAt: utcAt(2, 19, 0),
  },
  {
    channelKey: "modules",
    title: "DEMO SEED: CS101 Assessment Deadline",
    description: "CS101 continuous assessment submission deadline.",
    location: "Online Portal",
    startsAt: utcAt(5, 16, 0),
    endsAt: utcAt(5, 17, 0),
  },
  {
    channelKey: "faculty",
    title: "DEMO SEED: Faculty Consultation Hour",
    description: "Lecturer consultation for enrolled students.",
    location: "Faculty Office",
    startsAt: utcAt(3, 11, 0),
    endsAt: utcAt(3, 12, 0),
  },
  {
    channelKey: "clubs",
    title: "DEMO SEED: Clubs Showcase",
    description: "Clubs showcase for new members.",
    location: "Sports Field",
    startsAt: utcAt(7, 10, 0),
    endsAt: utcAt(7, 12, 0),
  },
];

const CALENDAR_SEEDS = [
  {
    id: "a80d1252-e44b-49cb-a805-2da766341101",
    actor: "student1",
    title: "DEMO SEED: Student Consultation",
    description: "One-on-one consultation.",
    location: "Lab 2",
    startsAt: utcAt(1, 10, 0),
    endsAt: utcAt(1, 11, 0),
  },
  {
    id: "a80d1252-e44b-49cb-a805-2da766341102",
    actor: "student1",
    title: "DEMO SEED: Student Assignment Due",
    description: "Submit assignment in portal.",
    location: "Online Portal",
    startsAt: utcAt(3, 14, 0),
    endsAt: utcAt(3, 15, 0),
  },
  {
    id: "a80d1252-e44b-49cb-a805-2da766341103",
    actor: "lecturer",
    title: "DEMO SEED: Lecturer Office Hour",
    description: "Open support session.",
    location: "Faculty Office",
    startsAt: utcAt(2, 9, 0),
    endsAt: utcAt(2, 10, 0),
  },
];

const UPLOAD_SEEDS = [
  {
    id: "c57e59f0-8646-453a-a5bc-f11e2aaa1101",
    actor: "lecturer",
    kind: "LECTURER_MATERIAL",
    originalName: "demo-seed-lecturer-material.txt",
    fileName: "demo-seed-lecturer-material.txt",
    content: "Demo seed lecturer material for production readiness checks.",
  },
  {
    id: "c57e59f0-8646-453a-a5bc-f11e2aaa1102",
    actor: "student1",
    kind: "STUDENT_SUBMISSION",
    originalName: "demo-seed-student-submission.txt",
    fileName: "demo-seed-student-submission.txt",
    content: "Demo seed student submission for uploads verification.",
  },
];

const ATTENDANCE_SEED = {
  courseCode: "DEMO-CS",
  courseName: "Demo Computer Science Course",
  facultyName: "Engineering",
  moduleCode: "CS101",
  moduleName: "Introduction to Computer Science",
  sessions: [
    {
      id: "f4cfd0f7-1905-4cca-b82c-9cb0b9e11101",
      attendanceDate: dateOnly(-2),
      startsAt: utcAt(-2, 8, 0),
      endsAt: utcAt(-2, 9, 0),
      records: [
        { actor: "student1", status: "PRESENT" },
        { actor: "student2", status: "LATE" },
      ],
    },
    {
      id: "f4cfd0f7-1905-4cca-b82c-9cb0b9e11102",
      attendanceDate: dateOnly(-1),
      startsAt: utcAt(-1, 8, 0),
      endsAt: utcAt(-1, 9, 0),
      records: [
        { actor: "student1", status: "ABSENT" },
        { actor: "student2", status: "PRESENT" },
      ],
    },
  ],
};

const NOTIFICATION_SEEDS = [
  {
    actor: "student1",
    category: "ANNOUNCEMENT",
    type: "EXEC_DEMO_ANNOUNCEMENT",
    title: "Welcome announcement available",
    body: "A new academic announcement is ready to view.",
    href: "/app/announcements",
    sourceKey: "exec-demo:student:announcement",
  },
  {
    actor: "parent",
    category: "FINANCE",
    type: "EXEC_DEMO_FINANCE",
    title: "Statement ready",
    body: "The latest learner statement is available in the parent finance view.",
    href: "/app/parent/finance",
    sourceKey: "exec-demo:parent:finance",
  },
  {
    actor: "academicAdmin",
    category: "ATTENDANCE",
    type: "EXEC_DEMO_ATTENDANCE",
    title: "Attendance records ready",
    body: "Demo attendance sessions and records are ready for academic review.",
    href: "/app/attendance",
    sourceKey: "exec-demo:academic-admin:attendance",
  },
  {
    actor: "financeAdmin",
    category: "FINANCE",
    type: "EXEC_DEMO_FINANCE_REVIEW",
    title: "Finance demo account ready",
    body: "Demo finance records and documents are available for review.",
    href: "/app/admin/finance",
    sourceKey: "exec-demo:finance-admin:finance",
  },
];

async function upsertDemoUser(pool, userSpec, summary) {
  const email = normalizeEmail(userSpec.email);
  const passwordHash = await bcrypt.hash(String(userSpec.password), 10);
  const adminScope = userSpec.role === "ADMIN" ? userSpec.adminScope || "SUPER" : null;

  const existing = await pool.query(
    `
      SELECT id
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email]
  );

  if ((existing.rowCount || 0) === 0) {
    const created = await pool.query(
      `
        INSERT INTO users (email, password_hash, role, admin_scope, public_student_id, south_african_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [email, passwordHash, userSpec.role, adminScope, userSpec.studentNumber, userSpec.southAfricanId]
    );
    summary.users.created += 1;
    return created.rows[0].id;
  }

  const id = existing.rows[0].id;
  await pool.query(
    `
      UPDATE users
      SET
        password_hash = $2,
        role = $3,
        admin_scope = $4,
        public_student_id = $5,
        south_african_id = $6
      WHERE id = $1
    `,
    [id, passwordHash, userSpec.role, adminScope, userSpec.studentNumber, userSpec.southAfricanId]
  );
  summary.users.updated += 1;
  return id;
}

async function ensureChannel(pool, pgRepos, input, summary) {
  const existing = await pool.query(
    `
      SELECT id, type, is_private AS "isPrivate"
      FROM channels
      WHERE lower(name) = lower($1)
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [input.name]
  );

  let channelId;
  if ((existing.rowCount || 0) === 0) {
    const created = await pgRepos.channels.create({
      name: input.name,
      type: input.type,
      isPrivate: input.isPrivate,
      createdBy: input.createdBy,
    });
    channelId = created.id;
    summary.channels.created += 1;
  } else {
    channelId = existing.rows[0].id;
    const currentType = String(existing.rows[0].type || "");
    const currentPrivate = Boolean(existing.rows[0].isPrivate);
    if (currentType !== input.type || currentPrivate !== Boolean(input.isPrivate)) {
      await pool.query(
        `
          UPDATE channels
          SET type = $2, is_private = $3
          WHERE id = $1
        `,
        [channelId, input.type, Boolean(input.isPrivate)]
      );
      summary.channels.updated += 1;
    }
  }

  const memberIds = Array.from(new Set([input.createdBy, ...(input.memberIds || [])]));
  if (memberIds.length > 0) {
    const joined = await pool.query(
      `
        INSERT INTO channel_members (channel_id, user_id)
        SELECT $1, x
        FROM unnest($2::uuid[]) AS x
        ON CONFLICT (channel_id, user_id) DO NOTHING
      `,
      [channelId, memberIds]
    );
    summary.channelMembers.added += Number(joined.rowCount || 0);
  }

  return channelId;
}

async function ensureAnnouncements(pgRepos, channelIdsByKey, createdBy, summary) {
  const existingByChannel = new Map();

  for (const seed of CHANNEL_ANNOUNCEMENT_SEEDS) {
    const channelId = channelIdsByKey[seed.channelKey];
    if (!channelId) continue;

    if (!existingByChannel.has(channelId)) {
      existingByChannel.set(channelId, await pgRepos.announcements.listByChannel(channelId));
    }
    const existing = existingByChannel.get(channelId);
    const found = existing.find((a) => String(a.title) === seed.title);
    if (!found) {
      await pgRepos.announcements.create({
        channelId,
        title: seed.title,
        body: seed.body,
        pinned: seed.pinned,
        createdBy,
      });
      summary.announcements.created += 1;
      continue;
    }

    if (String(found.body) !== seed.body || Boolean(found.pinned) !== Boolean(seed.pinned)) {
      await pgRepos.announcements.update({
        id: String(found.id),
        channelId,
        title: seed.title,
        body: seed.body,
        pinned: seed.pinned,
      });
      summary.announcements.updated += 1;
    }
  }
}

async function ensureChannelMessages(pgRepos, channelIdsByKey, usersByKey, summary) {
  const existingByChannel = new Map();

  for (const seed of CHANNEL_MESSAGE_SEEDS) {
    const channelId = channelIdsByKey[seed.channelKey];
    const authorId = usersByKey[seed.actor]?.id;
    if (!channelId || !authorId) continue;

    if (!existingByChannel.has(channelId)) {
      existingByChannel.set(channelId, await pgRepos.messages.listByChannel(channelId));
    }
    const existing = existingByChannel.get(channelId);
    const found = existing.find((m) => String(m.body) === seed.body && String(m.createdBy) === authorId);
    if (found) continue;

    await pgRepos.messages.create({
      channelId,
      body: seed.body,
      createdBy: authorId,
    });
    summary.channelMessages.created += 1;
  }
}

async function ensureChannelEvents(pgRepos, channelIdsByKey, createdBy, summary) {
  const existingByChannel = new Map();

  for (const seed of CHANNEL_EVENT_SEEDS) {
    const channelId = channelIdsByKey[seed.channelKey];
    if (!channelId) continue;

    if (!existingByChannel.has(channelId)) {
      existingByChannel.set(channelId, await pgRepos.events.listByChannel(channelId));
    }
    const existing = existingByChannel.get(channelId);
    const found = existing.find((e) => String(e.title) === seed.title);
    if (!found) {
      await pgRepos.events.create({
        channelId,
        title: seed.title,
        description: seed.description,
        location: seed.location,
        startsAt: seed.startsAt,
        endsAt: seed.endsAt,
        createdBy,
      });
      summary.events.created += 1;
      continue;
    }

    if (
      String(found.description || "") !== seed.description ||
      String(found.location || "") !== seed.location ||
      String(found.startsAt) !== seed.startsAt ||
      String(found.endsAt) !== seed.endsAt
    ) {
      await pgRepos.events.update({
        eventId: String(found.id),
        title: seed.title,
        description: seed.description,
        location: seed.location,
        startsAt: seed.startsAt,
        endsAt: seed.endsAt,
      });
      summary.events.updated += 1;
    }
  }
}

async function ensureThreadWithMessages(pgRepos, input, summary) {
  const created = await pgRepos.threads.createThread(input.starterId, [input.participantEmail]);
  const threadId = String(created.thread.id);
  if (created.created) summary.threads.created += 1;
  else summary.threads.reused += 1;

  const existing = await pgRepos.threads.listMessages(threadId, input.starterId, { limit: 100 });
  for (const msg of input.messages) {
    const found = existing.messages.find((m) => String(m.body) === msg.body && String(m.createdBy) === msg.authorId);
    if (found) continue;
    await pgRepos.threads.createMessage(threadId, msg.authorId, msg.body);
    summary.threadMessages.created += 1;
  }
}

async function ensurePendingParentLinkRequest(pool, parentId, studentId, summary) {
  const inserted = await pool.query(
    `
      INSERT INTO parent_link_requests (id, parent_user_id, student_user_id, status)
      VALUES (gen_random_uuid(), $1, $2, 'PENDING')
      ON CONFLICT (parent_user_id, student_user_id, status) DO NOTHING
      RETURNING id
    `,
    [parentId, studentId]
  );
  if ((inserted.rowCount || 0) > 0) summary.linkRequests.created += 1;
}

async function ensureAttendance(pool, usersByKey, summary) {
  const course = await pool.query(
    `
      INSERT INTO courses (code, name, description, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_active = true,
        updated_at = now()
      RETURNING id
    `,
    [
      ATTENDANCE_SEED.courseCode,
      ATTENDANCE_SEED.courseName,
      "Demo course used to group the seeded attendance module.",
    ]
  );
  const courseId = course.rows[0].id;

  await pool.query(
    `
      INSERT INTO courses (code, name, description, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_active = true,
        updated_at = now()
    `,
    [
      "DEMO-BIZ",
      "Demo Business Course",
      "Secondary seeded course for academic admin walkthroughs.",
    ]
  );

  const faculty = await pool.query(
    `
      INSERT INTO faculties (name)
      VALUES ($1)
      ON CONFLICT (name)
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `,
    [ATTENDANCE_SEED.facultyName]
  );
  const facultyId = faculty.rows[0].id;

  const moduleRow = await pool.query(
    `
      INSERT INTO faculty_modules (faculty_id, course_id, code, name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (code)
      DO UPDATE SET
        faculty_id = EXCLUDED.faculty_id,
        course_id = EXCLUDED.course_id,
        name = EXCLUDED.name
      RETURNING id
    `,
    [facultyId, courseId, ATTENDANCE_SEED.moduleCode, ATTENDANCE_SEED.moduleName]
  );
  const moduleId = moduleRow.rows[0].id;

  await pool.query(
    `
      INSERT INTO lecturer_module_assignments (module_id, lecturer_id)
      VALUES ($1, $2)
      ON CONFLICT (module_id, lecturer_id) DO NOTHING
    `,
    [moduleId, usersByKey.lecturer.id]
  );

  await pool.query(
    `
      INSERT INTO student_courses (student_user_id, course_id, status, enrolled_at)
      SELECT x, $1, 'ACTIVE', now()
      FROM unnest($2::uuid[]) AS x
      ON CONFLICT (student_user_id, course_id)
      DO UPDATE SET status = 'ACTIVE'
    `,
    [courseId, [usersByKey.student1.id, usersByKey.student2.id]]
  );

  const enrolled = await pool.query(
    `
      INSERT INTO student_module_enrollments (module_id, student_id)
      SELECT $1, x
      FROM unnest($2::uuid[]) AS x
      ON CONFLICT (module_id, student_id) DO NOTHING
    `,
    [moduleId, [usersByKey.student1.id, usersByKey.student2.id]]
  );
  summary.attendance.enrollmentsAdded += Number(enrolled.rowCount || 0);

  await pool.query(
    `
      UPDATE users
      SET course_name = $2
      WHERE id = ANY($1::uuid[])
        AND role = 'STUDENT'
    `,
    [[usersByKey.student1.id, usersByKey.student2.id], ATTENDANCE_SEED.courseName]
  );

  for (const session of ATTENDANCE_SEED.sessions) {
    const sessionExists = await pool.query(`SELECT 1 FROM attendance_sessions WHERE id = $1 LIMIT 1`, [session.id]);
    await pool.query(
      `
        INSERT INTO attendance_sessions (
          id, lecturer_id, module_id, attendance_date, starts_at, ends_at, created_by, created_at
        )
        VALUES ($1, $2, $3, $4::date, $5::timestamptz, $6::timestamptz, $7, now())
        ON CONFLICT (id) DO UPDATE
        SET
          lecturer_id = EXCLUDED.lecturer_id,
          module_id = EXCLUDED.module_id,
          attendance_date = EXCLUDED.attendance_date,
          starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at,
          created_by = EXCLUDED.created_by
      `,
      [
        session.id,
        usersByKey.lecturer.id,
        moduleId,
        session.attendanceDate,
        session.startsAt,
        session.endsAt,
        usersByKey.lecturer.id,
      ]
    );
    if ((sessionExists.rowCount || 0) === 0) summary.attendance.sessionsCreated += 1;
    else summary.attendance.sessionsUpdated += 1;

    for (const record of session.records) {
      const studentId = usersByKey[record.actor]?.id;
      if (!studentId) continue;

      const recordExists = await pool.query(
        `
          SELECT 1
          FROM attendance_records
          WHERE session_id = $1 AND student_id = $2
          LIMIT 1
        `,
        [session.id, studentId]
      );

      await pool.query(
        `
          INSERT INTO attendance_records (session_id, student_id, status, marked_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (session_id, student_id)
          DO UPDATE SET
            status = EXCLUDED.status,
            marked_at = now(),
            marked_by = EXCLUDED.marked_by
        `,
        [session.id, studentId, record.status, usersByKey.lecturer.id]
      );

      if ((recordExists.rowCount || 0) === 0) summary.attendance.recordsCreated += 1;
      else summary.attendance.recordsUpdated += 1;
    }
  }
}

async function ensureResults(pool, studentId, summary) {
  for (const seed of RESULT_SEEDS) {
    const exists = await pool.query(`SELECT 1 FROM assessment_results WHERE id = $1 LIMIT 1`, [seed.id]);
    await pool.query(
      `
        INSERT INTO assessment_results (id, student_user_id, subject, score, out_of, assessed_at)
        VALUES ($1, $2, $3, $4, $5, $6::date)
        ON CONFLICT (id) DO UPDATE
        SET
          student_user_id = EXCLUDED.student_user_id,
          subject = EXCLUDED.subject,
          score = EXCLUDED.score,
          out_of = EXCLUDED.out_of,
          assessed_at = EXCLUDED.assessed_at
      `,
      [seed.id, studentId, seed.subject, seed.score, seed.outOf, seed.date]
    );
    if ((exists.rowCount || 0) === 0) summary.results.created += 1;
    else summary.results.updated += 1;
  }
}

async function ensureFinance(pool, pgRepos, studentId, createdBy, summary) {
  await pgRepos.finance.ensureAccount(studentId);

  for (const seed of FINANCE_SEEDS) {
    const exists = await pool.query(`SELECT 1 FROM finance_transactions WHERE id = $1 LIMIT 1`, [seed.id]);
    await pool.query(
      `
        INSERT INTO finance_transactions (id, user_id, amount_cents, currency, description, occurred_at, created_at)
        VALUES ($1, $2, $3, 'ZAR', $4, $5::timestamptz, now())
        ON CONFLICT (id) DO UPDATE
        SET
          user_id = EXCLUDED.user_id,
          amount_cents = EXCLUDED.amount_cents,
          currency = EXCLUDED.currency,
          description = EXCLUDED.description,
          occurred_at = EXCLUDED.occurred_at
      `,
      [seed.id, studentId, seed.amountCents, seed.description, seed.occurredAt]
    );
    if ((exists.rowCount || 0) === 0) summary.finance.transactionsCreated += 1;
    else summary.finance.transactionsUpdated += 1;
  }

  await pool.query(
    `
      UPDATE finance_accounts
      SET
        balance_cents = COALESCE(
          (SELECT SUM(amount_cents)::int FROM finance_transactions WHERE user_id = $1),
          0
        ),
        currency = 'ZAR',
        account_status = 'OUTSTANDING',
        status_note = 'March fees are partially settled. Final payment is due this month.',
        updated_at = now()
      WHERE user_id = $1
    `,
    [studentId]
  );

  for (const seed of FINANCE_DOCUMENT_SEEDS) {
    const exists = await pool.query(`SELECT 1 FROM finance_documents WHERE id = $1 LIMIT 1`, [seed.id]);
    await pool.query(
      `
        INSERT INTO finance_documents (
          id, user_id, type, title, description, amount_cents, currency, issued_at, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'ZAR', $7::timestamptz, $8)
        ON CONFLICT (id) DO UPDATE
        SET
          user_id = EXCLUDED.user_id,
          type = EXCLUDED.type,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          amount_cents = EXCLUDED.amount_cents,
          currency = EXCLUDED.currency,
          issued_at = EXCLUDED.issued_at,
          created_by = EXCLUDED.created_by
      `,
      [seed.id, studentId, seed.type, seed.title, seed.description, seed.amountCents, seed.issuedAt, createdBy]
    );
    if ((exists.rowCount || 0) === 0) summary.finance.documentsCreated += 1;
    else summary.finance.documentsUpdated += 1;
  }

  for (const seed of FINANCE_NOTIFICATION_SEEDS) {
    const exists = await pool.query(`SELECT 1 FROM finance_notifications WHERE id = $1 LIMIT 1`, [seed.id]);
    await pool.query(
      `
        INSERT INTO finance_notifications (id, user_id, title, body, severity, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE
        SET
          user_id = EXCLUDED.user_id,
          title = EXCLUDED.title,
          body = EXCLUDED.body,
          severity = EXCLUDED.severity,
          created_by = EXCLUDED.created_by
      `,
      [seed.id, studentId, seed.title, seed.body, seed.severity, createdBy]
    );
    if ((exists.rowCount || 0) === 0) summary.finance.notificationsCreated += 1;
    else summary.finance.notificationsUpdated += 1;
  }

  const tx = await pgRepos.finance.listTransactions(studentId, { limit: 100 });
  summary.finance.totalTransactions = tx.length;
  summary.finance.statementLike = tx.filter((x) => /statement/i.test(String(x.description || ""))).length;
}

async function ensureLearnerProfiles(pool, usersByKey, summary) {
  const seeds = [
    {
      userId: usersByKey.student1.id,
      externalSourceId: "EXEC-DEMO-20231771",
      activationRequired: false,
      onboardingStatus: "ACTIVATED",
      activatedAt: "now()",
      completedAt: "now()",
    },
    {
      userId: usersByKey.student2.id,
      externalSourceId: "EXEC-DEMO-20231772",
      activationRequired: true,
      onboardingStatus: "PENDING_ACTIVATION",
      activatedAt: null,
      completedAt: null,
    },
  ];

  for (const seed of seeds) {
    const exists = await pool.query(`SELECT 1 FROM student_profiles WHERE user_id = $1 LIMIT 1`, [seed.userId]);
    await pool.query(
      `
        INSERT INTO student_profiles (
          user_id,
          verified_from_talent,
          external_source,
          external_source_id,
          locked_fields,
          source_metadata,
          activation_required,
          onboarding_status,
          activated_at,
          completed_at,
          updated_at
        )
        VALUES (
          $1,
          true,
          'EXEC_DEMO',
          $2,
          $3::jsonb,
          $4::jsonb,
          $5,
          $6,
          CASE WHEN $7::text = 'now()' THEN now() ELSE NULL END,
          CASE WHEN $8::text = 'now()' THEN now() ELSE NULL END,
          now()
        )
        ON CONFLICT (user_id) DO UPDATE
        SET
          verified_from_talent = true,
          external_source = EXCLUDED.external_source,
          external_source_id = EXCLUDED.external_source_id,
          locked_fields = EXCLUDED.locked_fields,
          source_metadata = EXCLUDED.source_metadata,
          activation_required = EXCLUDED.activation_required,
          onboarding_status = EXCLUDED.onboarding_status,
          activated_at = EXCLUDED.activated_at,
          completed_at = EXCLUDED.completed_at,
          updated_at = now()
      `,
      [
        seed.userId,
        seed.externalSourceId,
        JSON.stringify(["email", "public_student_id", "south_african_id"]),
        JSON.stringify({ seed: "exec-demo", importedFor: "client-smoke-test" }),
        seed.activationRequired,
        seed.onboardingStatus,
        seed.activatedAt,
        seed.completedAt,
      ]
    );
    if ((exists.rowCount || 0) === 0) summary.learnerProfiles.created += 1;
    else summary.learnerProfiles.updated += 1;
  }
}

async function ensureNotifications(pool, usersByKey, summary) {
  for (const seed of NOTIFICATION_SEEDS) {
    const userId = usersByKey[seed.actor]?.id;
    if (!userId) continue;

    const exists = await pool.query(
      `
        SELECT 1
        FROM user_notifications
        WHERE user_id = $1 AND source_key = $2
        LIMIT 1
      `,
      [userId, seed.sourceKey]
    );

    await pool.query(
      `
        INSERT INTO user_notifications (
          user_id,
          category,
          type,
          title,
          body,
          meta,
          source_key,
          is_read
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, false)
        ON CONFLICT (user_id, source_key) WHERE source_key IS NOT NULL
        DO UPDATE
        SET
          category = EXCLUDED.category,
          type = EXCLUDED.type,
          title = EXCLUDED.title,
          body = EXCLUDED.body,
          meta = EXCLUDED.meta,
          is_read = false,
          read_at = NULL
      `,
      [
        userId,
        seed.category,
        seed.type,
        seed.title,
        seed.body,
        JSON.stringify({ href: seed.href, seed: "exec-demo" }),
        seed.sourceKey,
      ]
    );

    if ((exists.rowCount || 0) === 0) summary.notifications.created += 1;
    else summary.notifications.updated += 1;
  }
}

async function ensureCalendar(pool, usersByKey, summary) {
  for (const seed of CALENDAR_SEEDS) {
    const userId = usersByKey[seed.actor].id;
    const exists = await pool.query(`SELECT 1 FROM calendar_entries WHERE id = $1 LIMIT 1`, [seed.id]);
    await pool.query(
      `
        INSERT INTO calendar_entries (id, user_id, title, description, location, starts_at, ends_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, now())
        ON CONFLICT (id) DO UPDATE
        SET
          user_id = EXCLUDED.user_id,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          location = EXCLUDED.location,
          starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at
      `,
      [seed.id, userId, seed.title, seed.description, seed.location, seed.startsAt, seed.endsAt]
    );
    if ((exists.rowCount || 0) === 0) summary.calendar.created += 1;
    else summary.calendar.updated += 1;
  }
}

async function ensureUploads(pool, usersByKey, summary) {
  const projectRoot = path.resolve(__dirname, "..");
  const uploadDir = path.resolve(projectRoot, String(process.env.UPLOAD_DIR || "").trim() || "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });

  for (const seed of UPLOAD_SEEDS) {
    const uploadedBy = usersByKey[seed.actor].id;
    const absPath = path.resolve(uploadDir, seed.fileName);
    fs.writeFileSync(absPath, seed.content, "utf8");

    const storagePath = path.posix.join("uploads", seed.fileName);
    const sizeBytes = Buffer.byteLength(seed.content, "utf8");
    const exists = await pool.query(`SELECT 1 FROM uploads WHERE id = $1 LIMIT 1`, [seed.id]);

    await pool.query(
      `
        INSERT INTO uploads
          (id, kind, original_name, mime_type, size_bytes, storage_path, uploaded_by, created_at)
        VALUES
          ($1, $2, $3, 'text/plain', $4, $5, $6, now())
        ON CONFLICT (id) DO UPDATE
        SET
          kind = EXCLUDED.kind,
          original_name = EXCLUDED.original_name,
          mime_type = EXCLUDED.mime_type,
          size_bytes = EXCLUDED.size_bytes,
          storage_path = EXCLUDED.storage_path,
          uploaded_by = EXCLUDED.uploaded_by
      `,
      [seed.id, seed.kind, seed.originalName, sizeBytes, storagePath, uploadedBy]
    );

    if ((exists.rowCount || 0) === 0) summary.uploads.created += 1;
    else summary.uploads.updated += 1;
  }
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  const loadedEnv = loadEnv(projectRoot);
  if (loadedEnv) {
    console.log(`[seed:exec-demo] loaded env: ${path.basename(loadedEnv)}`);
  } else {
    console.log("[seed:exec-demo] no .env file found, using process environment only");
  }

  const { pool } = require("../dist/config/db");
  const { pgRepos } = require("../dist/persistence/pg");

  const summary = {
    users: { created: 0, updated: 0 },
    links: { created: 0 },
    linkRequests: { created: 0 },
    channels: { created: 0, updated: 0 },
    channelMembers: { added: 0 },
    announcements: { created: 0, updated: 0 },
    channelMessages: { created: 0 },
    events: { created: 0, updated: 0 },
    threads: { created: 0, reused: 0 },
    threadMessages: { created: 0 },
    attendance: { sessionsCreated: 0, sessionsUpdated: 0, recordsCreated: 0, recordsUpdated: 0, enrollmentsAdded: 0 },
    learnerProfiles: { created: 0, updated: 0 },
    results: { created: 0, updated: 0 },
    finance: {
      transactionsCreated: 0,
      transactionsUpdated: 0,
      documentsCreated: 0,
      documentsUpdated: 0,
      notificationsCreated: 0,
      notificationsUpdated: 0,
      totalTransactions: 0,
      statementLike: 0,
    },
    calendar: { created: 0, updated: 0 },
    uploads: { created: 0, updated: 0 },
    notifications: { created: 0, updated: 0 },
  };

  const usersByKey = {};

  try {
    for (const [key, userSpec] of Object.entries(DEMO_USERS)) {
      const userId = await upsertDemoUser(pool, userSpec, summary);
      usersByKey[key] = { id: userId, ...userSpec };
    }

    const link = await pool.query(
      `
        INSERT INTO parent_links (parent_user_id, student_user_id)
        VALUES ($1, $2)
        ON CONFLICT (parent_user_id, student_user_id) DO NOTHING
      `,
      [usersByKey.parent.id, usersByKey.student1.id]
    );
    summary.links.created += Number(link.rowCount || 0);

    await ensurePendingParentLinkRequest(pool, usersByKey.parent.id, usersByKey.student2.id, summary);

    const channelIdsByKey = {};
    for (const channelSeed of CHANNEL_SEEDS) {
      const channelId = await ensureChannel(
        pool,
        pgRepos,
        {
          name: channelSeed.name,
          type: channelSeed.type,
          isPrivate: channelSeed.isPrivate,
          createdBy: usersByKey.admin.id,
          memberIds: [
            usersByKey.admin.id,
            usersByKey.academicAdmin.id,
            usersByKey.financeAdmin.id,
            usersByKey.lecturer.id,
            usersByKey.student1.id,
            usersByKey.parent.id,
          ],
        },
        summary
      );
      channelIdsByKey[channelSeed.key] = channelId;
    }

    await ensureAnnouncements(pgRepos, channelIdsByKey, usersByKey.academicAdmin.id, summary);
    await ensureChannelMessages(pgRepos, channelIdsByKey, usersByKey, summary);
    await ensureChannelEvents(pgRepos, channelIdsByKey, usersByKey.lecturer.id, summary);

    await ensureThreadWithMessages(
      pgRepos,
      {
        starterId: usersByKey.parent.id,
        participantEmail: usersByKey.lecturer.email,
        messages: [
          { authorId: usersByKey.parent.id, body: "DEMO SEED: Parent message to lecturer." },
          { authorId: usersByKey.lecturer.id, body: "DEMO SEED: Lecturer reply to parent." },
        ],
      },
      summary
    );

    await ensureThreadWithMessages(
      pgRepos,
      {
        starterId: usersByKey.student1.id,
        participantEmail: usersByKey.lecturer.email,
        messages: [
          { authorId: usersByKey.student1.id, body: "DEMO SEED: Student message to lecturer." },
          { authorId: usersByKey.lecturer.id, body: "DEMO SEED: Lecturer reply to student." },
        ],
      },
      summary
    );

    await ensureThreadWithMessages(
      pgRepos,
      {
        starterId: usersByKey.admin.id,
        participantEmail: usersByKey.lecturer.email,
        messages: [
          { authorId: usersByKey.admin.id, body: "DEMO SEED: Admin message to lecturer." },
          { authorId: usersByKey.lecturer.id, body: "DEMO SEED: Lecturer response to admin." },
        ],
      },
      summary
    );

    await ensureAttendance(pool, usersByKey, summary);
    await ensureLearnerProfiles(pool, usersByKey, summary);
    await ensureResults(pool, usersByKey.student1.id, summary);
    await ensureFinance(pool, pgRepos, usersByKey.student1.id, usersByKey.financeAdmin.id, summary);
    await ensureCalendar(pool, usersByKey, summary);
    await ensureUploads(pool, usersByKey, summary);
    await ensureNotifications(pool, usersByKey, summary);

    console.log("");
    console.log("=== DEMO SEED SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));
    console.log("");
    console.log("=== DEMO CREDENTIALS ===");
    console.log(`SUPER ADMIN    ${DEMO_USERS.admin.email} / ${DEMO_USERS.admin.password}`);
    console.log(`ACADEMIC ADMIN ${DEMO_USERS.academicAdmin.email} / ${DEMO_USERS.academicAdmin.password}`);
    console.log(`FINANCE ADMIN  ${DEMO_USERS.financeAdmin.email} / ${DEMO_USERS.financeAdmin.password}`);
    console.log(`LEGACY STAFF   ${DEMO_USERS.lecturer.email} / ${DEMO_USERS.lecturer.password}`);
    console.log(
      `STUDENT        ${DEMO_USERS.student1.email} / ${DEMO_USERS.student1.password} (internal reference ${DEMO_USERS.student1.studentNumber})`
    );
    console.log(
      `STUDENT2       ${DEMO_USERS.student2.email} / ${DEMO_USERS.student2.password} (internal reference ${DEMO_USERS.student2.studentNumber})`
    );
    console.log(`PARENT         ${DEMO_USERS.parent.email} / ${DEMO_USERS.parent.password}`);
    console.log("");
    console.log("THREADS_MODE should be D6 in production.");
  } finally {
    await pool.end();
  }
}

run().catch((e) => {
  console.error("[seed:exec-demo] failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
