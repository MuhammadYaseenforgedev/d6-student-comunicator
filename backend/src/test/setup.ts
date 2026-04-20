import { pool } from "../config/db";
import fs from "fs";
import path from "path";
import crypto from "crypto";

jest.setTimeout(30000);

function hashSql(sql: string): string {
  const normalized = String(sql).replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

async function runMigrations() {
  const migrationsDir = path.resolve(__dirname, "../../migrations");
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations folder not found: ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, "utf8");
    const checksum = hashSql(sql);

    const existing = await pool.query<{ checksum: string }>(
      `SELECT checksum FROM schema_migrations WHERE filename = $1 LIMIT 1`,
      [file]
    );

    if ((existing.rowCount ?? 0) > 0) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Migration checksum mismatch for ${file}`);
      }
      continue;
    }

    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query(`INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)`, [
        file,
        checksum,
      ]);
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
  }
}

function describeDbTarget(): string {
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      const database = url.pathname.replace(/^\/+/, "") || "(no database)";
      return `DATABASE_URL host=${url.hostname || "(empty)"} port=${url.port || "5432"} database=${database}`;
    } catch {
      return "DATABASE_URL=(invalid URL)";
    }
  }

  return `DB_HOST=${process.env.DB_HOST ?? "localhost"} DB_PORT=${process.env.DB_PORT ?? "5432"} DB_NAME=${
    process.env.DB_NAME ?? "d6_student_communicator"
  } DB_USER=${process.env.DB_USER ?? "postgres"}`;
}

function formatSetupError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const nestedErrors = (error as { errors?: unknown[] } | null)?.errors;
  const details =
    Array.isArray(nestedErrors)
      ? nestedErrors
          .map((entry) => (entry instanceof Error ? entry.message : String(entry)))
          .join("; ")
      : "";

  return new Error(
    [
      `Postgres-backed tests could not connect to the test database (${describeDbTarget()}).`,
      "Start/create the test database or set ENV_FILE/DATABASE_URL/DB_* for a reachable Postgres instance.",
      details || message,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

beforeAll(async () => {
  try {
    await runMigrations();
    await pool.query("SELECT 1");
  } catch (error) {
    throw formatSetupError(error);
  }
});

afterAll(async () => {
  await pool.end();
});
