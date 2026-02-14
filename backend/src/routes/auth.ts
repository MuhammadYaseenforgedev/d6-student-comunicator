import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "../config/db";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

const VALID_ROLES = ["ADMIN", "LECTURER", "STUDENT", "PARENT"] as const;
type Role = (typeof VALID_ROLES)[number];

type JwtUser = {
  id: string;
  email: string;
  role: Role;
};

function signToken(user: JwtUser) {
  const secret: Secret = (process.env.JWT_SECRET ?? "dev_secret_change_me") as Secret;
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, { expiresIn });
}

function normEmail(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function isValidPurpose(p: unknown): p is "LOGIN" | "REGISTER" {
  const x = String(p ?? "").trim().toUpperCase();
  return x === "LOGIN" || x === "REGISTER";
}

function otpConfig() {
  const ttlMinutes = Number(process.env.OTP_TTL_MINUTES ?? "10");
  const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS ?? "5");

  const emailWindowMinutes = Number(process.env.OTP_EMAIL_WINDOW_MINUTES ?? "10");
  const emailMaxPerWindow = Number(process.env.OTP_EMAIL_MAX_PER_WINDOW ?? "5");

  const ipWindowMinutes = Number(process.env.OTP_IP_WINDOW_MINUTES ?? "10");
  const ipMaxPerWindow = Number(process.env.OTP_IP_MAX_PER_WINDOW ?? "25");

  const ttl = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 10;
  const maxA = Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 5;

  const eWin = Number.isFinite(emailWindowMinutes) && emailWindowMinutes > 0 ? emailWindowMinutes : 10;
  const eMax = Number.isFinite(emailMaxPerWindow) && emailMaxPerWindow > 0 ? emailMaxPerWindow : 5;

  const iWin = Number.isFinite(ipWindowMinutes) && ipWindowMinutes > 0 ? ipWindowMinutes : 10;
  const iMax = Number.isFinite(ipMaxPerWindow) && ipMaxPerWindow > 0 ? ipMaxPerWindow : 25;

  return {
    ttlMinutes: ttl,
    maxAttempts: maxA,
    emailWindowMinutes: eWin,
    emailMaxPerWindow: eMax,
    ipWindowMinutes: iWin,
    ipMaxPerWindow: iMax,
  };
}

function isProduction() {
  return String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
}

function shouldReturnDevCode() {
  return !isProduction() && String(process.env.OTP_RETURN_DEV_CODE ?? "").toLowerCase() === "true";
}

function generateOtpCode(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

function normalizeIp(ip: string): string {
  const s = String(ip ?? "").trim();
  if (!s) return "unknown";

  // If we get IPv4-mapped IPv6 like ::ffff:127.0.0.1
  if (s.startsWith("::ffff:")) return s.replace("::ffff:", "");

  // If we get IPv6 loopback
  if (s === "::1") return "127.0.0.1";

  return s;
}

function getClientIp(req: any): string {
  // When trust proxy is enabled, Express sets req.ip based on x-forwarded-for
  // But we still defensively parse x-forwarded-for ourselves.
  const xf = String(req.headers?.["x-forwarded-for"] ?? "").trim();
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    return normalizeIp(first || "unknown");
  }
  return normalizeIp(String(req.ip ?? req.connection?.remoteAddress ?? "unknown"));
}

/**
 * DB-backed rate limit per EMAIL
 */
async function checkEmailOtpRateLimit(email: string) {
  const { emailWindowMinutes, emailMaxPerWindow } = otpConfig();

  const res = await pool.query<{ c: string }>(
    `
      SELECT COUNT(*)::text AS c
      FROM email_otps
      WHERE lower(email) = lower($1)
        AND created_at >= (now() - ($2 || ' minutes')::interval)
    `,
    [email, String(emailWindowMinutes)]
  );

  const count = Number(res.rows[0]?.c ?? "0");
  if (Number.isFinite(count) && count >= emailMaxPerWindow) {
    return { ok: false as const, retryAfterSeconds: emailWindowMinutes * 60 };
  }
  return { ok: true as const, retryAfterSeconds: 0 };
}

/**
 * DB-backed rate limit per IP
 * Requires: email_otps.request_ip column exists
 */
async function checkIpOtpRateLimit(ip: string) {
  const { ipWindowMinutes, ipMaxPerWindow } = otpConfig();

  const res = await pool.query<{ c: string }>(
    `
      SELECT COUNT(*)::text AS c
      FROM email_otps
      WHERE request_ip = $1
        AND created_at >= (now() - ($2 || ' minutes')::interval)
    `,
    [ip, String(ipWindowMinutes)]
  );

  const count = Number(res.rows[0]?.c ?? "0");
  if (Number.isFinite(count) && count >= ipMaxPerWindow) {
    return { ok: false as const, retryAfterSeconds: ipWindowMinutes * 60 };
  }
  return { ok: true as const, retryAfterSeconds: 0 };
}

/**
 * Create a new OTP row (hashed). Never store OTP in plain text.
 * Stores request_ip for DB-backed IP rate limiting.
 */
async function createOtp(email: string, purpose: "LOGIN" | "REGISTER", requestIp: string) {
  const { ttlMinutes } = otpConfig();
  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  await pool.query(
    `
      INSERT INTO email_otps (email, purpose, code_hash, expires_at, request_ip)
      VALUES ($1, $2, $3, $4::timestamptz, $5)
    `,
    [email, purpose, codeHash, expiresAt, requestIp]
  );

  if (!isProduction()) {
    console.log(`[OTP][${purpose}] email=${email} ip=${requestIp} code=${code} (expires ${expiresAt})`);
  }

  return { expiresAt, devCode: shouldReturnDevCode() ? code : undefined };
}

/**
 * Verify newest valid OTP for (email, purpose), enforce attempts, consume on success.
 * Uses transaction + row lock to prevent double-consume under concurrency.
 */
async function verifyAndConsumeOtp(email: string, purpose: "LOGIN" | "REGISTER", code: string) {
  const { maxAttempts } = otpConfig();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const res = await client.query<{
      id: string;
      code_hash: string;
      expires_at: string;
      attempts: number;
      consumed_at: string | null;
    }>(
      `
        SELECT id, code_hash, expires_at, attempts, consumed_at
        FROM email_otps
        WHERE lower(email) = lower($1)
          AND purpose = $2
          AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [email, purpose]
    );

    if (res.rowCount === 0) {
      await client.query("COMMIT");
      return { ok: false, status: 400, code: "VALIDATION", message: "OTP not found" as const };
    }

    const row = res.rows[0];
    const exp = new Date(row.expires_at).getTime();
    if (!Number.isFinite(exp) || exp <= Date.now()) {
      await client.query("COMMIT");
      return { ok: false, status: 400, code: "VALIDATION", message: "OTP expired" as const };
    }

    if (row.attempts >= maxAttempts) {
      await client.query("COMMIT");
      return { ok: false, status: 429, code: "RATE_LIMIT", message: "Too many OTP attempts" as const };
    }

    const match = await bcrypt.compare(code, row.code_hash);

    if (!match) {
      await client.query(`UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
      await client.query("COMMIT");
      return { ok: false, status: 400, code: "VALIDATION", message: "Invalid OTP" as const };
    }

    await client.query(`UPDATE email_otps SET consumed_at = now() WHERE id = $1`, [row.id]);
    await client.query("COMMIT");
    return { ok: true as const };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/* =========
   OTP: REQUEST
   =========
   POST /auth/request-otp
   Body: { email, purpose: "LOGIN" | "REGISTER" }
*/
authRouter.post("/auth/request-otp", async (req, res) => {
  const email = normEmail(req.body?.email);
  const purposeRaw = req.body?.purpose;

  if (!email || !isValidPurpose(purposeRaw)) {
    return res.status(400).json({
      error: { code: "VALIDATION", message: "email and purpose are required" },
    });
  }

  const ip = getClientIp(req);

  // Rate limit per IP (DB-backed)
  const ipCheck = await checkIpOtpRateLimit(ip);
  if (!ipCheck.ok) {
    res.setHeader("Retry-After", String(ipCheck.retryAfterSeconds));
    return res.status(429).json({
      error: { code: "RATE_LIMIT", message: "Too many OTP requests from this IP" },
    });
  }

  // Rate limit per email (DB-backed)
  const emailCheck = await checkEmailOtpRateLimit(email);
  if (!emailCheck.ok) {
    res.setHeader("Retry-After", String(emailCheck.retryAfterSeconds));
    return res.status(429).json({
      error: { code: "RATE_LIMIT", message: "Too many OTP requests for this email" },
    });
  }

  // No enumeration: always ok:true, even if user doesn't exist.
  const out = await createOtp(email, purposeRaw, ip);

  return res.json({
    ok: true,
    expiresAt: out.expiresAt,
    devCode: out.devCode,
  });
});

/* =========
   REGISTER (requires OTP)
   =========
   POST /auth/register
   Body: { email, password, role, otp }
*/
authRouter.post("/auth/register", async (req, res) => {
  const email = normEmail(req.body?.email);
  const password = String(req.body?.password ?? "");
  const role = String(req.body?.role ?? "").toUpperCase();
  const otp = String(req.body?.otp ?? "").trim();

  if (!email || !password || !role || !otp) {
    return res.status(400).json({ error: { code: "VALIDATION", message: "Missing fields" } });
  }

  if (!VALID_ROLES.includes(role as Role)) {
    return res.status(400).json({ error: { code: "VALIDATION", message: "Invalid role" } });
  }

  const otpRes = await verifyAndConsumeOtp(email, "REGISTER", otp);
  if (!otpRes.ok) {
    return res.status(otpRes.status).json({ error: { code: otpRes.code, message: otpRes.message } });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      `
        INSERT INTO users (email, password_hash, role)
        VALUES ($1, $2, $3)
        RETURNING id, email, role
      `,
      [email, passwordHash, role]
    );

    const user = result.rows[0] as JwtUser;
    const token = signToken(user);

    return res.status(201).json({ token, user });
  } catch {
    return res.status(400).json({ error: { code: "VALIDATION", message: "Email already exists" } });
  }
});

/* =========
   LOGIN (requires OTP)
   =========
   POST /auth/login
   Body: { email, password, otp }
*/
authRouter.post("/auth/login", async (req, res) => {
  const email = normEmail(req.body?.email);
  const password = String(req.body?.password ?? "");
  const otp = String(req.body?.otp ?? "").trim();

  if (!email || !password || !otp) {
    return res.status(400).json({ error: { code: "VALIDATION", message: "Missing fields" } });
  }

  const result = await pool.query(`SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1`, [email]);
  const userRow = result.rows[0];
  if (!userRow) return res.status(401).json({ error: { code: "AUTH", message: "Invalid credentials" } });

  const match = await bcrypt.compare(password, userRow.password_hash);
  if (!match) return res.status(401).json({ error: { code: "AUTH", message: "Invalid credentials" } });

  const otpRes = await verifyAndConsumeOtp(email, "LOGIN", otp);
  if (!otpRes.ok) {
    return res.status(otpRes.status).json({ error: { code: otpRes.code, message: otpRes.message } });
  }

  const user: JwtUser = { id: userRow.id, email: userRow.email, role: userRow.role };
  const token = signToken(user);

  return res.json({ token, user });
});

/* =========
   ME
   ========= */
authRouter.get("/auth/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});
