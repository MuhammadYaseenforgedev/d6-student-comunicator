import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const VALID_APP_ENVS = ["development", "test", "staging", "demo", "production", "local"] as const;
const DEFAULT_DEMO_OTP_ALLOWED_ENVS = ["test", "staging", "demo"] as const;

export type AppEnv = (typeof VALID_APP_ENVS)[number];

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

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "true" || v === "1" || v === "yes" || v === "y";
}

function parseStrictBoolean(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Invalid ${name}: expected "true" or "false"`);
}

function parseAppEnvValue(raw: string, source: string): AppEnv {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (!normalized) {
    throw new Error(`Invalid ${source}: value is required`);
  }
  if (!VALID_APP_ENVS.includes(normalized as AppEnv)) {
    throw new Error(
      `Invalid ${source}: expected one of ${VALID_APP_ENVS.join(", ")} but received "${raw}"`
    );
  }
  return normalized as AppEnv;
}

function parseEmailList(raw: string | undefined): string[] {
  const seen = new Set<string>();
  const values = String(raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  for (const value of values) {
    seen.add(value);
  }

  return Array.from(seen);
}

function parseAppEnvList(raw: string | undefined): AppEnv[] {
  const values = String(raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (values.length === 0) {
    return [...DEFAULT_DEMO_OTP_ALLOWED_ENVS];
  }

  const seen = new Set<AppEnv>();
  for (const value of values) {
    seen.add(parseAppEnvValue(value, "DEMO_OTP_ALLOWED_ENVS"));
  }

  return Array.from(seen);
}

export function getAppEnv(): AppEnv {
  const rawAppEnv = String(process.env.APP_ENV ?? "").trim();
  if (rawAppEnv) {
    return parseAppEnvValue(rawAppEnv, "APP_ENV");
  }

  const rawNodeEnv = String(process.env.NODE_ENV ?? "").trim();
  if (rawNodeEnv) {
    return parseAppEnvValue(rawNodeEnv, "NODE_ENV");
  }

  return "development";
}

export function getAllowDemoOtpBypass(): boolean {
  return parseStrictBoolean("ALLOW_DEMO_OTP_BYPASS", false);
}

export function getDemoOtpAllowlist(): string[] {
  return parseEmailList(process.env.DEMO_OTP_ALLOWLIST);
}

export function getDemoOtpAllowedEnvs(): AppEnv[] {
  return parseAppEnvList(process.env.DEMO_OTP_ALLOWED_ENVS);
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
const SMTP_HOST = String(process.env.SMTP_HOST ?? "").trim() || undefined;
const SMTP_PORT = parsePositiveInt(process.env.SMTP_PORT, 587);
const SMTP_SECURE = parseBoolean(process.env.SMTP_SECURE, false);
const SMTP_USER = String(process.env.SMTP_USER ?? "").trim() || undefined;
const SMTP_PASS = String(process.env.SMTP_PASS ?? "").trim() || undefined;
const SMTP_FROM = String(process.env.SMTP_FROM ?? "").trim() || undefined;
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY ?? "").trim() || undefined;
const OPENAI_ASSISTANT_MODEL =
  String(process.env.OPENAI_ASSISTANT_MODEL ?? "").trim() || "gpt-5.4-mini";

if (!DATABASE_URL && !DB_PASSWORD) {
  required("DB_PASSWORD");
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? "4000"),
  DATABASE_URL: DATABASE_URL || undefined,
  get APP_ENV(): AppEnv {
    return getAppEnv();
  },

  // DB
  DB_HOST: process.env.DB_HOST ?? dbFromUrl?.host ?? "localhost",
  DB_PORT: parsePositiveInt(process.env.DB_PORT, dbFromUrl?.port ?? 5432),
  DB_USER: process.env.DB_USER ?? dbFromUrl?.user ?? "postgres",
  DB_PASSWORD,
  DB_NAME: process.env.DB_NAME ?? dbFromUrl?.database ?? "d6_student_communicator",

  // SMTP
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,

  // OpenAI
  OPENAI_API_KEY,
  OPENAI_ASSISTANT_MODEL,

  // Demo OTP bypass controls
  get ALLOW_DEMO_OTP_BYPASS(): boolean {
    return getAllowDemoOtpBypass();
  },
  get DEMO_OTP_ALLOWLIST(): string[] {
    return getDemoOtpAllowlist();
  },
  get DEMO_OTP_ALLOWED_ENVS(): AppEnv[] {
    return getDemoOtpAllowedEnvs();
  },
};
