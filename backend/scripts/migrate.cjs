#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");
const { Client } = require("pg");

function loadEnv(projectRoot) {
  const explicit = String(process.env.ENV_FILE || "").trim();
  const candidates = [];

  if (explicit) {
    candidates.push(path.isAbsolute(explicit) ? explicit : path.resolve(projectRoot, explicit));
  } else {
    if (String(process.env.NODE_ENV || "").toLowerCase() === "test") {
      candidates.push(path.resolve(projectRoot, ".env.test"));
    }
    candidates.push(path.resolve(projectRoot, ".env"));
  }

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, override: false });
    return envPath;
  }

  return null;
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function buildDbConfig() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (databaseUrl) {
    try {
      // Validate format early for clearer migration failures.
      new URL(databaseUrl);
    } catch (e) {
      throw new Error(`Invalid DATABASE_URL: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { connectionString: databaseUrl };
  }

  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "postgres",
    password: required("DB_PASSWORD"),
    database: process.env.DB_NAME || "d6_student_communicator",
  };
}

function hashSql(sql) {
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  const migrationsDir = path.resolve(projectRoot, "migrations");

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations folder not found: ${migrationsDir}`);
  }

  const loadedEnv = loadEnv(projectRoot);
  if (loadedEnv) {
    console.log(`[migrate] loaded env: ${path.basename(loadedEnv)}`);
  } else {
    console.log("[migrate] no .env file found, using process environment only");
  }

  const client = new Client(buildDbConfig());

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.log("[migrate] no SQL files found");
    return;
  }

  await client.connect();

  try {
    await client.query(`
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

      const existing = await client.query(
        `SELECT checksum FROM schema_migrations WHERE filename = $1 LIMIT 1`,
        [file]
      );

      if ((existing.rowCount || 0) > 0) {
        const oldChecksum = String(existing.rows[0].checksum || "");
        if (oldChecksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch for ${file}. Existing DB checksum differs from file.`
          );
        }
        console.log(`[migrate] skip ${file}`);
        continue;
      }

      console.log(`[migrate] apply ${file}`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)`,
          [file, checksum]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`[${file}] ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log("[migrate] complete");
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(`[migrate] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
