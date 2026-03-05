import bcrypt from "bcryptjs";
import { pool } from "../config/db";

type Role = "ADMIN" | "PARENT" | "LECTURER" | "STUDENT";
type ResultAction = "created" | "updated" | "skipped";

type DemoUserSpec = {
  email: string;
  role: Role;
  studentNumber?: string | null;
};

type EnsureResult = {
  email: string;
  role: Role;
  action: ResultAction;
  note?: string;
};

const DEMO_PASSWORD = "DemoPass123";

const DEMO_USERS: DemoUserSpec[] = [
  { email: "demo+admin@local.test", role: "ADMIN" },
  { email: "demo+parent@local.test", role: "PARENT" },
  { email: "demo+lecturer@local.test", role: "LECTURER" },
  { email: "demo+student1@local.test", role: "STUDENT", studentNumber: "STU-1001" },
];

function normalizeEmail(v: string): string {
  return String(v ?? "").trim().toLowerCase();
}

function normalizeStudentNumber(v: string | null | undefined): string | null {
  const out = String(v ?? "").trim().toUpperCase();
  return out ? out : null;
}

async function ensureUser(spec: DemoUserSpec): Promise<EnsureResult> {
  const email = normalizeEmail(spec.email);
  const desiredStudentNumber = spec.role === "STUDENT" ? normalizeStudentNumber(spec.studentNumber ?? null) : null;

  const existing = await pool.query<{
    id: string;
    role: string;
    password_hash: string;
    public_student_id: string | null;
  }>(
    `
      SELECT id, role, password_hash, public_student_id
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email]
  );

  if ((existing.rowCount ?? 0) === 0) {
    if (desiredStudentNumber) {
      const holder = await pool.query<{ id: string; email: string }>(
        `
          SELECT id, email
          FROM users
          WHERE public_student_id = $1
          LIMIT 1
        `,
        [desiredStudentNumber]
      );
      if ((holder.rowCount ?? 0) > 0 && normalizeEmail(holder.rows[0].email) !== email) {
        return {
          email,
          role: spec.role,
          action: "skipped",
          note: `studentNumber ${desiredStudentNumber} already assigned to ${holder.rows[0].email}`,
        };
      }
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await pool.query(
      `
        INSERT INTO users (email, password_hash, role, public_student_id)
        VALUES ($1, $2, $3, $4)
      `,
      [email, passwordHash, spec.role, desiredStudentNumber]
    );
    return { email, role: spec.role, action: "created" };
  }

  const row = existing.rows[0];
  let effectiveStudentNumber = desiredStudentNumber;
  let note: string | undefined;

  if (desiredStudentNumber) {
    const holder = await pool.query<{ id: string; email: string }>(
      `
        SELECT id, email
        FROM users
        WHERE public_student_id = $1
        LIMIT 1
      `,
      [desiredStudentNumber]
    );
    if ((holder.rowCount ?? 0) > 0 && holder.rows[0].id !== row.id) {
      effectiveStudentNumber = normalizeStudentNumber(row.public_student_id);
      note = `studentNumber ${desiredStudentNumber} already assigned to ${holder.rows[0].email}`;
    }
  }

  const roleMatches = String(row.role ?? "").toUpperCase() === spec.role;
  const studentMatches = normalizeStudentNumber(row.public_student_id) === effectiveStudentNumber;
  const passwordMatches = await bcrypt.compare(DEMO_PASSWORD, String(row.password_hash ?? ""));

  if (roleMatches && studentMatches && passwordMatches) {
    return { email, role: spec.role, action: "skipped", note };
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await pool.query(
    `
      UPDATE users
      SET
        role = $2,
        password_hash = $3,
      public_student_id = $4
      WHERE id = $1
    `,
    [row.id, spec.role, passwordHash, effectiveStudentNumber]
  );

  return { email, role: spec.role, action: "updated", note };
}

async function run(): Promise<void> {
  const results: EnsureResult[] = [];

  try {
    for (const spec of DEMO_USERS) {
      const result = await ensureUser(spec);
      results.push(result);
    }

    const counts = results.reduce(
      (acc, r) => {
        acc[r.action] += 1;
        return acc;
      },
      { created: 0, updated: 0, skipped: 0 }
    );

    console.log("Demo user seed summary");
    for (const r of results) {
      const suffix = r.note ? ` [${r.note}]` : "";
      console.log(`- ${r.action.toUpperCase()}: ${r.email} (${r.role})${suffix}`);
    }
    console.log(`Totals: created=${counts.created}, updated=${counts.updated}, skipped=${counts.skipped}`);
  } finally {
    await pool.end();
  }
}

run().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`[seed:demo] failed: ${message}`);
  process.exit(1);
});
