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

const DEMO_USERS = {
  admin: {
    email: "admin.exec.demo@d6demo.co.za",
    password: "D6ExecAdmin!2026",
    role: "ADMIN",
    studentNumber: null,
    southAfricanId: null,
  },
  lecturer: {
    email: "lecturer.exec.demo@d6demo.co.za",
    password: "D6ExecLecturer!2026",
    role: "LECTURER",
    studentNumber: null,
    southAfricanId: null,
  },
  student: {
    email: "student.exec.demo@d6demo.co.za",
    password: "D6ExecStudent!2026",
    role: "STUDENT",
    studentNumber: "STU-EXEC-1001",
    southAfricanId: "0101015009087",
  },
  parent: {
    email: "parent.exec.demo@d6demo.co.za",
    password: "D6ExecParent!2026",
    role: "PARENT",
    studentNumber: null,
    southAfricanId: null,
  },
};

const RESULT_SEEDS = [
  { id: "f9cf5ca6-4ed2-4d86-9f7d-7e4d95fef101", subject: "Mathematics", score: 88, outOf: 100, date: "2026-02-17" },
  { id: "f9cf5ca6-4ed2-4d86-9f7d-7e4d95fef102", subject: "English", score: 81, outOf: 100, date: "2026-02-18" },
  { id: "f9cf5ca6-4ed2-4d86-9f7d-7e4d95fef103", subject: "Science", score: 91, outOf: 100, date: "2026-02-19" },
  { id: "f9cf5ca6-4ed2-4d86-9f7d-7e4d95fef104", subject: "History", score: 77, outOf: 100, date: "2026-02-20" },
];

const FINANCE_SEEDS = [
  {
    id: "45f5d95e-4f65-4df1-9594-f8ca1f6a1101",
    amountCents: 250000,
    description: "EXEC DEMO: Tuition Fee Term 1",
    occurredAt: utcAt(-20, 8, 0),
  },
  {
    id: "45f5d95e-4f65-4df1-9594-f8ca1f6a1102",
    amountCents: 45000,
    description: "EXEC DEMO: Statement 2026-01",
    occurredAt: utcAt(-15, 10, 30),
  },
  {
    id: "45f5d95e-4f65-4df1-9594-f8ca1f6a1103",
    amountCents: 47000,
    description: "EXEC DEMO: Statement 2026-02",
    occurredAt: utcAt(-8, 9, 15),
  },
  {
    id: "45f5d95e-4f65-4df1-9594-f8ca1f6a1104",
    amountCents: -150000,
    description: "EXEC DEMO: EFT Payment",
    occurredAt: utcAt(-5, 12, 0),
  },
];

const CHANNEL_ANNOUNCEMENTS = [
  { title: "EXEC DEMO: Launch", body: "Welcome to the executive self-test environment.", pinned: true },
  { title: "EXEC DEMO: Parent Meeting", body: "Parent meeting starts at 18:00 in Main Hall.", pinned: false },
  { title: "EXEC DEMO: Assessment Week", body: "Continuous assessment submissions are open this week.", pinned: false },
];

const CHANNEL_MESSAGES = [
  { body: "EXEC DEMO: Lecturer welcome message.", actor: "lecturer" },
  { body: "EXEC DEMO: Student acknowledgement.", actor: "student" },
  { body: "EXEC DEMO: Lecturer assignment reminder.", actor: "lecturer" },
  { body: "EXEC DEMO: Student asks for clarification.", actor: "student" },
  { body: "EXEC DEMO: Lecturer follow-up response.", actor: "lecturer" },
  { body: "EXEC DEMO: Student thanks lecturer.", actor: "student" },
];

const CHANNEL_EVENT_SEEDS = [
  {
    title: "EXEC DEMO: Parent Meeting",
    description: "Executive demo channel event.",
    location: "Main Hall",
    startsAt: utcAt(2, 18, 0),
    endsAt: utcAt(2, 19, 0),
  },
  {
    title: "EXEC DEMO: Assessment Deadline",
    description: "Executive demo assessment deadline.",
    location: "Online Portal",
    startsAt: utcAt(5, 16, 0),
    endsAt: utcAt(5, 17, 0),
  },
  {
    title: "EXEC DEMO: General Event",
    description: "Executive demo school event.",
    location: "Sports Field",
    startsAt: utcAt(7, 10, 0),
    endsAt: utcAt(7, 12, 0),
  },
];

const CALENDAR_SEEDS = [
  {
    id: "8a6a9f5d-c2d3-4cf7-89bf-a2a9f7b4a101",
    actor: "student",
    title: "EXEC DEMO: Student Consultation",
    description: "One-on-one consultation.",
    location: "Lab 2",
    startsAt: utcAt(1, 10, 0),
    endsAt: utcAt(1, 11, 0),
  },
  {
    id: "8a6a9f5d-c2d3-4cf7-89bf-a2a9f7b4a102",
    actor: "student",
    title: "EXEC DEMO: Student Assignment Due",
    description: "Submit assignment in portal.",
    location: "Online Portal",
    startsAt: utcAt(3, 14, 0),
    endsAt: utcAt(3, 15, 0),
  },
  {
    id: "8a6a9f5d-c2d3-4cf7-89bf-a2a9f7b4a103",
    actor: "lecturer",
    title: "EXEC DEMO: Lecturer Office Hour",
    description: "Open support session.",
    location: "Faculty Office",
    startsAt: utcAt(2, 9, 0),
    endsAt: utcAt(2, 10, 0),
  },
  {
    id: "8a6a9f5d-c2d3-4cf7-89bf-a2a9f7b4a104",
    actor: "lecturer",
    title: "EXEC DEMO: Lecturer Planning",
    description: "Weekly planning block.",
    location: "Staff Room",
    startsAt: utcAt(4, 13, 0),
    endsAt: utcAt(4, 14, 0),
  },
];

const UPLOAD_SEEDS = [
  {
    id: "4a8d020d-4b2e-4cb0-8db2-beb5be4ab101",
    actor: "lecturer",
    kind: "LECTURER_MATERIAL",
    originalName: "exec-demo-lecturer-material-1.txt",
    fileName: "exec-demo-lecturer-material-1.txt",
    content: "Executive demo lecturer material 1.",
  },
  {
    id: "4a8d020d-4b2e-4cb0-8db2-beb5be4ab102",
    actor: "lecturer",
    kind: "LECTURER_MATERIAL",
    originalName: "exec-demo-lecturer-material-2.txt",
    fileName: "exec-demo-lecturer-material-2.txt",
    content: "Executive demo lecturer material 2.",
  },
  {
    id: "4a8d020d-4b2e-4cb0-8db2-beb5be4ab103",
    actor: "student",
    kind: "STUDENT_SUBMISSION",
    originalName: "exec-demo-student-submission-1.txt",
    fileName: "exec-demo-student-submission-1.txt",
    content: "Executive demo student submission 1.",
  },
];

async function upsertDemoUser(pool, userSpec, summary) {
  const email = normalizeEmail(userSpec.email);
  const passwordHash = await bcrypt.hash(String(userSpec.password), 10);

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
        INSERT INTO users (email, password_hash, role, public_student_id, south_african_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [email, passwordHash, userSpec.role, userSpec.studentNumber, userSpec.southAfricanId]
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
        public_student_id = $4,
        south_african_id = $5
      WHERE id = $1
    `,
    [id, passwordHash, userSpec.role, userSpec.studentNumber, userSpec.southAfricanId]
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

async function ensureAnnouncements(pgRepos, channelId, createdBy, summary) {
  const existing = await pgRepos.announcements.listByChannel(channelId);

  for (const seed of CHANNEL_ANNOUNCEMENTS) {
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

async function ensureChannelMessages(pgRepos, channelId, usersByKey, summary) {
  const existing = await pgRepos.messages.listByChannel(channelId);

  for (const seed of CHANNEL_MESSAGES) {
    const authorId = usersByKey[seed.actor].id;
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

async function ensureChannelEvents(pgRepos, channelId, createdBy, summary) {
  const existing = await pgRepos.events.listByChannel(channelId);
  for (const seed of CHANNEL_EVENT_SEEDS) {
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

async function removeParentStudentThreads(pool, parentId, studentId, summary) {
  const rows = await pool.query(
    `
      SELECT tp.thread_id
      FROM thread_participants tp
      GROUP BY tp.thread_id
      HAVING COUNT(*) = 2
         AND BOOL_OR(tp.user_id = $1::uuid)
         AND BOOL_OR(tp.user_id = $2::uuid)
    `,
    [parentId, studentId]
  );

  const threadIds = rows.rows.map((r) => String(r.thread_id));
  if (threadIds.length === 0) return;

  const deleted = await pool.query(`DELETE FROM threads WHERE id = ANY($1::uuid[])`, [threadIds]);
  summary.threads.parentStudentRemoved += Number(deleted.rowCount || 0);
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

async function ensureFinance(pool, pgRepos, studentId, summary) {
  await pgRepos.finance.ensureAccount(studentId);

  const txIds = FINANCE_SEEDS.map((x) => x.id);
  await pool.query(
    `
      DELETE FROM finance_transactions
      WHERE user_id = $1
        AND description LIKE 'EXEC DEMO:%'
        AND id <> ALL($2::uuid[])
    `,
    [studentId, txIds]
  );

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
        updated_at = now()
      WHERE user_id = $1
    `,
    [studentId]
  );

  const tx = await pgRepos.finance.listTransactions(studentId, { limit: 100 });
  summary.finance.totalTransactions = tx.length;
  summary.finance.statementLike = tx.filter((x) => /statement/i.test(String(x.description || ""))).length;
}

async function ensureCalendar(pool, usersByKey, summary) {
  const seedIds = CALENDAR_SEEDS.map((x) => x.id);
  const ownerIds = [usersByKey.student.id, usersByKey.lecturer.id];

  await pool.query(
    `
      DELETE FROM calendar_entries
      WHERE user_id = ANY($1::uuid[])
        AND title LIKE 'EXEC DEMO:%'
        AND id <> ALL($2::uuid[])
    `,
    [ownerIds, seedIds]
  );

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

  const seedIds = UPLOAD_SEEDS.map((x) => x.id);
  await pool.query(
    `
      DELETE FROM uploads
      WHERE original_name LIKE 'exec-demo-%'
        AND id <> ALL($1::uuid[])
    `,
    [seedIds]
  );

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
    channels: { created: 0, updated: 0 },
    channelMembers: { added: 0 },
    announcements: { created: 0, updated: 0 },
    channelMessages: { created: 0 },
    events: { created: 0, updated: 0 },
    threads: { created: 0, reused: 0, parentStudentRemoved: 0 },
    threadMessages: { created: 0 },
    results: { created: 0, updated: 0 },
    finance: { transactionsCreated: 0, transactionsUpdated: 0, totalTransactions: 0, statementLike: 0 },
    calendar: { created: 0, updated: 0 },
    uploads: { created: 0, updated: 0 },
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
      [usersByKey.parent.id, usersByKey.student.id]
    );
    summary.links.created += Number(link.rowCount || 0);

    const publicChannelId = await ensureChannel(
      pool,
      pgRepos,
      {
        name: "EXEC DEMO - General",
        type: "MODULE",
        isPrivate: false,
        createdBy: usersByKey.admin.id,
        memberIds: [usersByKey.lecturer.id, usersByKey.student.id, usersByKey.parent.id],
      },
      summary
    );

    const privateChannelId = await ensureChannel(
      pool,
      pgRepos,
      {
        name: "EXEC DEMO - Private Class",
        type: "FACULTY",
        isPrivate: true,
        createdBy: usersByKey.admin.id,
        memberIds: [usersByKey.lecturer.id, usersByKey.student.id],
      },
      summary
    );

    await ensureAnnouncements(pgRepos, publicChannelId, usersByKey.admin.id, summary);
    await ensureChannelMessages(pgRepos, publicChannelId, usersByKey, summary);
    await ensureChannelEvents(pgRepos, publicChannelId, usersByKey.lecturer.id, summary);

    await removeParentStudentThreads(pool, usersByKey.parent.id, usersByKey.student.id, summary);

    await ensureThreadWithMessages(
      pgRepos,
      {
        starterId: usersByKey.parent.id,
        participantEmail: usersByKey.lecturer.email,
        messages: [
          { authorId: usersByKey.parent.id, body: "EXEC DEMO: Parent message to lecturer." },
          { authorId: usersByKey.lecturer.id, body: "EXEC DEMO: Lecturer reply to parent." },
        ],
      },
      summary
    );

    await ensureThreadWithMessages(
      pgRepos,
      {
        starterId: usersByKey.student.id,
        participantEmail: usersByKey.lecturer.email,
        messages: [
          { authorId: usersByKey.student.id, body: "EXEC DEMO: Student message to lecturer." },
          { authorId: usersByKey.lecturer.id, body: "EXEC DEMO: Lecturer reply to student." },
        ],
      },
      summary
    );

    await ensureResults(pool, usersByKey.student.id, summary);
    await ensureFinance(pool, pgRepos, usersByKey.student.id, summary);
    await ensureCalendar(pool, usersByKey, summary);
    await ensureUploads(pool, usersByKey, summary);

    console.log("");
    console.log("=== EXEC DEMO SEED SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));
    console.log("");
    console.log("=== EXEC DEMO CREDENTIALS ===");
    console.log(`ADMIN    ${DEMO_USERS.admin.email} / ${DEMO_USERS.admin.password}`);
    console.log(`LECTURER ${DEMO_USERS.lecturer.email} / ${DEMO_USERS.lecturer.password}`);
    console.log(
      `STUDENT  ${DEMO_USERS.student.email} / ${DEMO_USERS.student.password} (studentNumber=${DEMO_USERS.student.studentNumber})`
    );
    console.log(`PARENT   ${DEMO_USERS.parent.email} / ${DEMO_USERS.parent.password}`);
    console.log("");
    console.log("THREADS_MODE should be D6 in production.");
    console.log(`Private channel seeded: ${privateChannelId}`);
  } finally {
    await pool.end();
  }
}

run().catch((e) => {
  console.error("[seed:exec-demo] failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
