import fs from "fs";
import path from "path";
import dotenv from "dotenv";

function loadEnvFile() {
  const explicit = String(process.env.ENV_FILE ?? "").trim();
  const candidates: string[] = [];

  if (explicit) {
    candidates.push(path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit));
  } else {
    if (String(process.env.NODE_ENV ?? "").toLowerCase() === "test") {
      candidates.push(path.resolve(process.cwd(), ".env.test"));
    }
    candidates.push(path.resolve(process.cwd(), ".env"));
  }

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath });
    return;
  }

  dotenv.config();
}

loadEnvFile();

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

type ParsedDatabaseUrl = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const v = String(raw ?? "").trim();
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseDatabaseUrl(raw: string): ParsedDatabaseUrl {
  try {
    const url = new URL(raw);

    const dbPath = url.pathname.replace(/^\/+/, "").trim();
    const portRaw = String(url.port ?? "").trim();
    const parsedPort = portRaw ? Number(portRaw) : undefined;
    const port = parsedPort !== undefined && Number.isFinite(parsedPort) ? parsedPort : undefined;

    return {
      host: url.hostname || undefined,
      port,
      user: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      database: dbPath ? decodeURIComponent(dbPath) : undefined,
    };
  } catch (e) {
    throw new Error(`Invalid DATABASE_URL: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const DATABASE_URL = String(process.env.DATABASE_URL ?? "").trim();
const dbFromUrl = DATABASE_URL ? parseDatabaseUrl(DATABASE_URL) : null;
const DB_PASSWORD = String(process.env.DB_PASSWORD ?? "").trim() || dbFromUrl?.password || "";

if (!DATABASE_URL && !DB_PASSWORD) {
  required("DB_PASSWORD");
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? "4000"),
  DATABASE_URL: DATABASE_URL || undefined,

  // DB
  DB_HOST: process.env.DB_HOST ?? dbFromUrl?.host ?? "localhost",
  DB_PORT: parsePositiveInt(process.env.DB_PORT, dbFromUrl?.port ?? 5432),
  DB_USER: process.env.DB_USER ?? dbFromUrl?.user ?? "postgres",
  DB_PASSWORD,
  DB_NAME: process.env.DB_NAME ?? dbFromUrl?.database ?? "d6_student_communicator",
};
