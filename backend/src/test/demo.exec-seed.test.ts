import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { pool } from "../config/db";

const backendRoot = path.resolve(__dirname, "../..");
const execSeedScript = path.join(backendRoot, "scripts", "seed_exec_demo.cjs");
const compiledDbModule = path.join(backendRoot, "dist", "config", "db.js");

const DEMO_EMAILS = [
  "demo+admin@co.za",
  "demo+academic-admin@co.za",
  "demo+finance-admin@co.za",
  "demo+lecturer@co.za",
  "demo+student1@replace-with-real-inbox.com",
  "demo+student2@replace-with-real-inbox.com",
  "demo+parent@co.za",
];

const DEMO_WHATSAPP_PREFERENCES = [
  { email: "demo+academic-admin@co.za", phone: "+27820000001" },
  { email: "demo+parent@co.za", phone: "+27820000002" },
  { email: "demo+student1@replace-with-real-inbox.com", phone: "+27820000003" },
];

function runExecSeed() {
  if (!fs.existsSync(compiledDbModule)) {
    throw new Error("Run `npm --prefix backend run build` before the exec demo seed test.");
  }

  execFileSync(process.execPath, [execSeedScript], {
    cwd: backendRoot,
    env: process.env,
    stdio: "pipe",
  });
}

describe("Exec demo seed script", () => {
  jest.setTimeout(120000);

  test("creates scoped demo accounts and smoke-test data idempotently", async () => {
    runExecSeed();
    runExecSeed();

    const users = await pool.query<{
      email: string;
      role: string;
      admin_scope: string | null;
      public_student_id: string | null;
    }>(
      `
        SELECT email, role, admin_scope, public_student_id
        FROM users
        WHERE lower(email) = ANY($1::text[])
        ORDER BY lower(email)
      `,
      [DEMO_EMAILS]
    );

    expect(users.rowCount).toBe(DEMO_EMAILS.length);
    expect(users.rows.find((row) => row.email === "demo+admin@co.za")?.admin_scope).toBe("SUPER");
    expect(users.rows.find((row) => row.email === "demo+academic-admin@co.za")?.admin_scope).toBe("ACADEMIC");
    expect(users.rows.find((row) => row.email === "demo+finance-admin@co.za")?.admin_scope).toBe("FINANCE");
    expect(users.rows.find((row) => row.email === "demo+lecturer@co.za")?.role).toBe("LECTURER");
    expect(users.rows.find((row) => row.email.includes("student1"))?.public_student_id).toBe("20231771");

    const linkedParent = await pool.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM parent_links pl
        JOIN users p ON p.id = pl.parent_user_id
        JOIN users s ON s.id = pl.student_user_id
        WHERE lower(p.email) = lower('demo+parent@co.za')
          AND lower(s.email) = lower('demo+student1@replace-with-real-inbox.com')
      `
    );
    expect(linkedParent.rows[0]?.count).toBe(1);

    const academicData = await pool.query<{ courses: number; modules: number; imported_learners: number }>(
      `
        SELECT
          (SELECT COUNT(*)::int FROM courses WHERE code = ANY(ARRAY['DEMO-CS', 'DEMO-BIZ'])) AS courses,
          (SELECT COUNT(*)::int FROM faculty_modules WHERE code = 'CS101') AS modules,
          (
            SELECT COUNT(*)::int
            FROM student_profiles
            WHERE external_source = 'EXEC_DEMO'
              AND onboarding_status IN ('ACTIVATED', 'PENDING_ACTIVATION')
          ) AS imported_learners
      `
    );
    expect(academicData.rows[0]?.courses).toBeGreaterThanOrEqual(2);
    expect(academicData.rows[0]?.modules).toBeGreaterThanOrEqual(1);
    expect(academicData.rows[0]?.imported_learners).toBeGreaterThanOrEqual(2);

    const demoData = await pool.query<{
      results: number;
      finance_documents: number;
      calendar_entries: number;
      announcements: number;
      uploads: number;
      attendance_sessions: number;
      attendance_records: number;
      notifications: number;
    }>(
      `
        SELECT
          (SELECT COUNT(*)::int FROM assessment_results WHERE subject = 'Computer Science') AS results,
          (SELECT COUNT(*)::int FROM finance_documents WHERE title IN ('March fee statement', 'Payment plan reminder')) AS finance_documents,
          (SELECT COUNT(*)::int FROM calendar_entries WHERE title LIKE 'DEMO SEED:%') AS calendar_entries,
          (SELECT COUNT(*)::int FROM announcements WHERE title LIKE 'DEMO SEED:%') AS announcements,
          (SELECT COUNT(*)::int FROM uploads WHERE original_name LIKE 'demo-seed-%') AS uploads,
          (SELECT COUNT(*)::int FROM attendance_sessions WHERE module_id IN (SELECT id FROM faculty_modules WHERE code = 'CS101')) AS attendance_sessions,
          (SELECT COUNT(*)::int FROM attendance_records WHERE session_id IN (SELECT id FROM attendance_sessions WHERE module_id IN (SELECT id FROM faculty_modules WHERE code = 'CS101'))) AS attendance_records,
          (SELECT COUNT(*)::int FROM user_notifications WHERE source_key LIKE 'exec-demo:%') AS notifications
      `
    );

    expect(demoData.rows[0]?.results).toBeGreaterThanOrEqual(1);
    expect(demoData.rows[0]?.finance_documents).toBeGreaterThanOrEqual(2);
    expect(demoData.rows[0]?.calendar_entries).toBeGreaterThanOrEqual(3);
    expect(demoData.rows[0]?.announcements).toBeGreaterThanOrEqual(5);
    expect(demoData.rows[0]?.uploads).toBeGreaterThanOrEqual(2);
    expect(demoData.rows[0]?.attendance_sessions).toBeGreaterThanOrEqual(2);
    expect(demoData.rows[0]?.attendance_records).toBeGreaterThanOrEqual(4);
    expect(demoData.rows[0]?.notifications).toBeGreaterThanOrEqual(4);

    const preferences = await pool.query<{
      email: string;
      whatsapp_phone_e164: string | null;
      whatsapp_enabled: boolean;
      whatsapp_opted_in_at: string | null;
      whatsapp_opted_out_at: string | null;
      source: string | null;
    }>(
      `
        SELECT
          lower(u.email) AS email,
          p.whatsapp_phone_e164,
          p.whatsapp_enabled,
          p.whatsapp_opted_in_at::text AS whatsapp_opted_in_at,
          p.whatsapp_opted_out_at::text AS whatsapp_opted_out_at,
          p.source
        FROM user_contact_preferences p
        JOIN users u ON u.id = p.user_id
        WHERE lower(u.email) = ANY($1::text[])
        ORDER BY lower(u.email)
      `,
      [DEMO_WHATSAPP_PREFERENCES.map((item) => item.email)]
    );

    expect(preferences.rowCount).toBe(DEMO_WHATSAPP_PREFERENCES.length);
    for (const expected of DEMO_WHATSAPP_PREFERENCES) {
      const row = preferences.rows.find((item) => item.email === expected.email);
      expect(row).toMatchObject({
        whatsapp_phone_e164: expected.phone,
        whatsapp_enabled: true,
        whatsapp_opted_out_at: null,
        source: "EXEC_DEMO_SEED",
      });
      expect(row?.whatsapp_opted_in_at).toBeTruthy();
    }

    const seedDeliveries = await pool.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM notification_deliveries d
        JOIN user_notifications n ON n.id = d.notification_id
        WHERE n.source_key LIKE 'exec-demo:%'
      `
    );
    expect(seedDeliveries.rows[0]?.count).toBe(0);
  });
});
