import { pool } from "../config/db";
import fs from "fs";
import path from "path";
import crypto from "crypto";

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

beforeAll(async () => {
  await runMigrations();
  await pool.query("SELECT 1");
});

afterAll(async () => {
  await pool.end();
});
