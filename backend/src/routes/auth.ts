import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "../config/db";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";
import { requireAccess } from "../middleware/rbac";
import { loginLimiter, registerLimiter } from "../middleware/rateLimit";
import { isSmtpConfigured, sendOtpEmail as sendOtpEmailViaSmtp } from "../lib/mailer";
import { validatePassword } from "../lib/passwordPolicy";
import { getEffectiveAdminScope, normalizeAdminScope, type AdminScope } from "../lib/adminAccess";
import {
  completeLearnerActivation,
  LearnerActivationError,
  validateLearnerActivationToken,
} from "../lib/learnerActivation";

export const authRouter = Router();

const VALID_ROLES = ["ADMIN", "LECTURER", "STUDENT", "PARENT"] as const;
type Role = (typeof VALID_ROLES)[number];
const PUBLIC_SELF_REGISTER_ROLES = ["STUDENT", "PARENT"] as const;
const STAFF_SELF_REGISTER_ROLES = ["ADMIN", "LECTURER"] as const;
type StaffSelfRegisterRole = (typeof STAFF_SELF_REGISTER_ROLES)[number];

type JwtUser = {
  id: string;
  email: string;
  role: Role;
  adminScope?: AdminScope | null;
};

function signToken(user: JwtUser) {
  const secret: Secret = (process.env.JWT_SECRET ?? "dev_secret_change_me") as Secret;
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, adminScope: getEffectiveAdminScope(user) },
    secret,
    { expiresIn }
  );
}

function normEmail(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function isProduction() {
  return env.APP_ENV === "production";
}

function boolEnv(name: string, defaultValue: boolean) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "true" || raw === "1" || raw === "yes" || raw === "y";
}

/**
 * Auth policy flags:
 * - In production: require OTP and block password-only auth shortcuts.
 * - In non-production: still default to OTP unless explicitly relaxed.
 *
 * You can override with env:
 * - AUTH_REQUIRE_OTP=true/false
 * - AUTH_ALLOW_PASSWORD_LOGIN=true/false
 * - AUTH_ALLOW_PASSWORD_REGISTER=true/false
 * - AUTH_STAFF_REGISTER_PASSWORD=... (required for ADMIN/LECTURER self-registration)
 */
function authPolicy() {
  const prod = isProduction();

  const requireOtp = prod ? true : boolEnv("AUTH_REQUIRE_OTP", true);
  const allowPasswordLogin = prod ? false : boolEnv("AUTH_ALLOW_PASSWORD_LOGIN", false);
  const allowPasswordRegister = prod ? false : boolEnv("AUTH_ALLOW_PASSWORD_REGISTER", false);

  return { requireOtp, allowPasswordLogin, allowPasswordRegister };
}

function shouldUseDemoOtpBypass(email: string): boolean {
  const normalizedEmail = normEmail(email);
  if (!normalizedEmail) return false;
  if (!env.ALLOW_DEMO_OTP_BYPASS) return false;
  if (env.APP_ENV === "production") return false;

  const allowedEnvs = new Set(env.DEMO_OTP_ALLOWED_ENVS);
  if (!allowedEnvs.has(env.APP_ENV)) return false;

  const allowlist = new Set(env.DEMO_OTP_ALLOWLIST);
  return allowlist.has(normalizedEmail);
}

function logDemoBypassUsage(kind: "request-otp", email: string) {
  console.warn("[auth] Demo auth bypass used", {
    kind,
    email: normEmail(email),
    appEnv: env.APP_ENV,
  });
}

class OtpDeliveryError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "OtpDeliveryError";
    this.status = status;
  }
}

function generateOtpCode(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
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

function buildOtpSuccessResponse(
  expiresAt: string,
  options?: { devCode?: string; emailDeliveryEnabled?: boolean }
) {
  const emailDeliveryEnabled =
    typeof options?.emailDeliveryEnabled === "boolean"
      ? options.emailDeliveryEnabled
      : isSmtpConfigured();

  return options?.devCode
    ? {
        ok: true as const,
        expiresAt,
        devOtp: options.devCode,
        emailDeliveryEnabled,
      }
    : {
        ok: true as const,
        expiresAt,
        emailDeliveryEnabled,
      };
}

function fallbackOtpExpiresAt(): string {
  return new Date(Date.now() + otpConfig().ttlMinutes * 60_000).toISOString();
}

function normalizeIp(ip: string): string {
  const s = String(ip ?? "").trim();
  if (!s) return "unknown";
  if (s.startsWith("::ffff:")) return s.replace("::ffff:", "");
  if (s === "::1") return "127.0.0.1";
  return s;
}

function getClientIp(req: any): string {
  const xf = String(req.headers?.["x-forwarded-for"] ?? "").trim();
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    return normalizeIp(first || "unknown");
  }
  return normalizeIp(String(req.ip ?? req.connection?.remoteAddress ?? "unknown"));
}

function parsePurpose(p: unknown): "LOGIN" | "REGISTER" | null {
  const x = String(p ?? "").trim().toUpperCase();
  if (x === "LOGIN" || x === "REGISTER") return x;
  return null;
}

function parseRole(v: unknown): Role | null {
  const role = String(v ?? "").trim().toUpperCase();
  return VALID_ROLES.includes(role as Role) ? (role as Role) : null;
}

function toJwtUser(row: {
  id: string;
  email: string;
  role: Role;
  admin_scope?: unknown;
  adminScope?: unknown;
}): JwtUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    adminScope: getEffectiveAdminScope({
      role: row.role,
      adminScope: row.admin_scope ?? row.adminScope,
    }),
  };
}

function normalizeStudentNumber(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function normalizeSouthAfricanId(v: unknown): string {
  return String(v ?? "").replace(/\D+/g, "");
}

function hasAcceptedLegalTerms(value: unknown): value is true {
  return value === true;
}

function isValidSouthAfricanId(v: string): boolean {
  return /^\d{13}$/.test(v);
}

function isStaffSelfRegisterRole(role: Role): role is StaffSelfRegisterRole {
  return STAFF_SELF_REGISTER_ROLES.includes(role as StaffSelfRegisterRole);
}

function timingSafeEquals(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function activationErr(res: any, error: LearnerActivationError) {
  return res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
    },
  });
}

/**
 * DB-backed rate limit per EMAIL (request-otp)
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
 * DB-backed rate limit per IP (request-otp)
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

/* ===============================
   OTP CREATION (HARDENED)
=================================*/
async function createOtp(
  email: string,
  purpose: "LOGIN" | "REGISTER",
  requestIp: string,
  options?: { skipEmailDelivery?: boolean; forceDevCode?: boolean }
) {
  const { ttlMinutes } = otpConfig();
  let checkpoint = "init";
  let code = "";
  let codeHash = "";
  let expiresAt = "";

  try {
    checkpoint = "consume_previous_otp";
    await pool.query(
      `
        UPDATE email_otps
        SET consumed_at = now()
        WHERE lower(email) = lower($1)
          AND purpose = $2
          AND consumed_at IS NULL
      `,
      [email, purpose]
    );

    checkpoint = "generate_code_hash";
    code = generateOtpCode();
    codeHash = await bcrypt.hash(code, 10);
    expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

    checkpoint = "store_otp";
    await pool.query(
      `
        INSERT INTO email_otps (email, purpose, code_hash, expires_at, request_ip)
        VALUES ($1, $2, $3, $4::timestamptz, $5)
      `,
      [email, purpose, codeHash, expiresAt, requestIp]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[otp][createOtp] failed before SMTP send", {
      email,
      purpose,
      checkpoint,
      message,
      stack,
    });
    throw err;
  }

  const skipEmailDelivery = Boolean(options?.skipEmailDelivery);

  if (skipEmailDelivery) {
    // Demo bypass and unknown-login parity intentionally suppress delivery.
  } else {
    const smtpConfigured = isSmtpConfigured();

    if (!smtpConfigured) {
      if (isProduction()) {
        throw new OtpDeliveryError(503, "OTP email service is not configured");
      }
    } else {
      try {
        await sendOtpEmailViaSmtp({ to: email, code, expiresAt });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        console.error("[otp][request-otp] SMTP send failed", {
          email,
          purpose,
          message,
          stack,
        });
        let error = err;
        if (!(error instanceof OtpDeliveryError)) {
          error = new OtpDeliveryError(503, "Failed to send OTP email");
        }
        await pool.query(
          `
            DELETE FROM email_otps
            WHERE lower(email) = lower($1)
              AND purpose = $2
              AND code_hash = $3
          `,
          [email, purpose, codeHash]
        );
        throw error;
      }
    }
  }

  return {
    code,
    expiresAt,
    devCode: options?.forceDevCode ? code : undefined,
  };
}

/* ===============================
   OTP VERIFY + CONSUME (HARDENED)
=================================*/
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
      return { ok: false as const, status: 400, code: "VALIDATION", message: "OTP not found" as const };
    }

    const row = res.rows[0];

    const exp = new Date(row.expires_at).getTime();
    if (!Number.isFinite(exp) || exp <= Date.now()) {
      await client.query("COMMIT");
      return { ok: false as const, status: 400, code: "VALIDATION", message: "OTP expired" as const };
    }

    if (row.attempts >= maxAttempts) {
      await client.query("COMMIT");
      return { ok: false as const, status: 429, code: "RATE_LIMIT", message: "Too many OTP attempts" as const };
    }

    const match = await bcrypt.compare(code, row.code_hash);

    if (!match) {
      await client.query(`UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
      await client.query("COMMIT");
      return { ok: false as const, status: 400, code: "VALIDATION", message: "Invalid OTP" as const };
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

/* ===============================
   IMPORTED LEARNER ACTIVATION
=================================*/
authRouter.get("/activate/validate", async (req, res) => {
  try {
    const activation = await validateLearnerActivationToken(pool, req.query.token);
    return res.json({
      ok: true,
      activation,
    });
  } catch (e) {
    if (e instanceof LearnerActivationError) {
      return activationErr(res, e);
    }
    console.error("[auth] GET /activate/validate error", e);
    return res.status(500).json({ error: { code: "INTERNAL", message: "Failed to validate activation token" } });
  }
});

authRouter.post("/activate", async (req, res) => {
  try {
    const activation = await completeLearnerActivation(pool, {
      token: req.body?.token,
      password: req.body?.password,
      acceptedLegalTerms: req.body?.acceptedLegalTerms,
    });

    return res.json({
      ok: true,
      activation,
    });
  } catch (e) {
    if (e instanceof LearnerActivationError) {
      return activationErr(res, e);
    }
    console.error("[auth] POST /activate error", e);
    return res.status(500).json({ error: { code: "INTERNAL", message: "Failed to activate learner account" } });
  }
});

/* ===============================
   REQUEST OTP
   POST /request-otp
   Body: { email, purpose: "LOGIN" | "REGISTER" }
=================================*/
authRouter.post("/request-otp", async (req, res) => {
  const email = normEmail(req.body?.email);
  const purpose = parsePurpose(req.body?.purpose);
  const emailDeliveryEnabled = isSmtpConfigured();

  if (!email || !purpose) {
    return res.status(400).json({
      error: { code: "VALIDATION", message: "email and purpose are required" },
    });
  }

  const ip = getClientIp(req);

  const ipCheck = await checkIpOtpRateLimit(ip);
  if (!ipCheck.ok) {
    res.setHeader("Retry-After", String(ipCheck.retryAfterSeconds));
    return res.status(429).json({
      error: { code: "RATE_LIMIT", message: "Too many OTP requests from this IP" },
    });
  }

  const emailCheck = await checkEmailOtpRateLimit(email);
  if (!emailCheck.ok) {
    res.setHeader("Retry-After", String(emailCheck.retryAfterSeconds));
    return res.status(429).json({
      error: { code: "RATE_LIMIT", message: "Too many OTP requests for this email" },
    });
  }

  const includeDevOtp = shouldUseDemoOtpBypass(email);
  let loginAccountExists = true;

  if (purpose === "LOGIN") {
    const r = await pool.query(`SELECT 1 FROM users WHERE lower(email)=lower($1) LIMIT 1`, [email]);
    loginAccountExists = (r.rowCount ?? 0) > 0;
  }

  try {
    if (includeDevOtp) {
      logDemoBypassUsage("request-otp", email);
    }

    const out = await createOtp(email, purpose, ip, {
      skipEmailDelivery: includeDevOtp || (purpose === "LOGIN" && !loginAccountExists),
      forceDevCode: includeDevOtp,
    });

    return res.json(
      buildOtpSuccessResponse(out.expiresAt, {
        devCode: includeDevOtp ? out.devCode : undefined,
        emailDeliveryEnabled,
      })
    );
  } catch (e: any) {
    if (purpose === "LOGIN" && e instanceof OtpDeliveryError) {
      return res.json(
        buildOtpSuccessResponse(fallbackOtpExpiresAt(), {
          emailDeliveryEnabled:
            e.message === "OTP email service is not configured"
              ? false
              : emailDeliveryEnabled,
        })
      );
    }
    if (e instanceof OtpDeliveryError) {
      return res.status(e.status).json({
        error: { code: "EMAIL_PROVIDER", message: e.message },
      });
    }
    return res.status(500).json({
      error: { code: "INTERNAL", message: "Failed to request OTP" },
    });
  }
});

/* ===============================
   REGISTER
   POST /register
   Supports:
   - OTP register:
     {
       email,
       password,
       role,
       otp,
       acceptedLegalTerms,              // required for self-registration
       staffRegisterPassword?,          // required for ADMIN/LECTURER
       studentNumber?, southAfricanId?  // required for STUDENT
     }
   - Optional dev register (if enabled): { email, password } when AUTH_ALLOW_PASSWORD_REGISTER=true
=================================*/
authRouter.post("/register", registerLimiter, async (req, res) => {
  const { requireOtp, allowPasswordRegister } = authPolicy();

  const email = normEmail(req.body?.email);
  const password = String(req.body?.password ?? "");
  const roleRaw = String(req.body?.role ?? "").trim();
  const role = roleRaw ? parseRole(roleRaw) : ("STUDENT" as Role);
  const staffRegisterPassword = String(req.body?.staffRegisterPassword ?? "").trim();
  const otp = String(req.body?.otp ?? "").trim();
  const southAfricanId = normalizeSouthAfricanId(req.body?.southAfricanId);
  const studentNumber = normalizeStudentNumber(req.body?.studentNumber);
  const acceptedLegalTerms = req.body?.acceptedLegalTerms;

  if (!email || !password) {
    return res.status(400).json({ error: { code: "VALIDATION", message: "Missing fields" } });
  }

  if (!hasAcceptedLegalTerms(acceptedLegalTerms)) {
    return res.status(400).json({
      error: {
        code: "VALIDATION",
        message: "You must accept the POPIA Disclosure and IT Terms of Use before registering.",
      },
    });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ error: { code: "VALIDATION", message: passwordError } });
  }

  if (!role) {
    return res.status(400).json({ error: { code: "VALIDATION", message: "Invalid role" } });
  }

  if (!(PUBLIC_SELF_REGISTER_ROLES as readonly Role[]).includes(role) && !isStaffSelfRegisterRole(role)) {
    return res.status(400).json({ error: { code: "VALIDATION", message: "Invalid role" } });
  }

  if (role === "STUDENT") {
    if (!southAfricanId) {
      return res.status(400).json({
        error: { code: "VALIDATION", message: "southAfricanId is required for student registration" },
      });
    }
    if (!isValidSouthAfricanId(southAfricanId)) {
      return res.status(400).json({
        error: { code: "VALIDATION", message: "southAfricanId must be exactly 13 digits" },
      });
    }
    if (!studentNumber) {
      return res.status(400).json({
        error: { code: "VALIDATION", message: "studentNumber is required for student registration" },
      });
    }
    if (studentNumber.length > 64) {
      return res.status(400).json({
        error: { code: "VALIDATION", message: "studentNumber must be 64 characters or fewer" },
      });
    }
  }

  if (isStaffSelfRegisterRole(role)) {
    const expected = String(process.env.AUTH_STAFF_REGISTER_PASSWORD ?? "").trim();
    if (!expected || !staffRegisterPassword || !timingSafeEquals(staffRegisterPassword, expected)) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Staff registration password is required for admin/lecturer registration",
        },
      });
    }
  }

  // Enforce OTP unless explicitly allowed not to
  if (requireOtp && !otp) {
    return res.status(400).json({ error: { code: "VALIDATION", message: "Missing fields" } });
  }

  if (otp) {
    const otpRes = await verifyAndConsumeOtp(email, "REGISTER", otp);
    if (!otpRes.ok) {
      if (otpRes.status === 429) {
        res.setHeader("Retry-After", String(otpConfig().ttlMinutes * 60));
      }
      return res.status(otpRes.status).json({ error: { code: otpRes.code, message: otpRes.message } });
    }
  } else {
    // No OTP supplied
    if (!allowPasswordRegister) {
      return res.status(400).json({
        error: { code: "VALIDATION", message: "OTP required for registration" },
      });
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const adminScope = role === "ADMIN" ? "ACADEMIC" : null;

    const result = await pool.query(
      `
        INSERT INTO users (
          email,
          password_hash,
          role,
          public_student_id,
          south_african_id,
          admin_scope,
          accepted_legal_terms_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
        RETURNING id, email, role, admin_scope
      `,
      [
        email,
        passwordHash,
        role,
        role === "STUDENT" ? studentNumber : null,
        role === "STUDENT" ? southAfricanId : null,
        adminScope,
      ]
    );

    const user = toJwtUser(result.rows[0] as JwtUser & { admin_scope?: string | null });
    const token = signToken(user);
    return res.status(201).json({ token, user });
  } catch (e: any) {
    if (String(e?.code ?? "") === "23505") {
      return res.status(400).json({
        error: {
          code: "VALIDATION",
          message: "Account already exists (email, student number, or South African ID)",
        },
      });
    }
    console.error("[auth] POST /register error", e);
    return res.status(500).json({ error: { code: "INTERNAL", message: "Failed to register account" } });
  }
});

/* ===============================
   ADMIN CREATE USER (protected)
   POST /admin-create
   Body: { email, password, role, studentNumber?, southAfricanId? }
   Only authenticated ADMIN may create privileged roles.
=================================*/
authRouter.post(
  "/admin-create",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    const roleRaw = String(req.body?.role ?? "").trim().toUpperCase();
    const studentNumber = normalizeStudentNumber(req.body?.studentNumber);
    const southAfricanId = normalizeSouthAfricanId(req.body?.southAfricanId);
    const adminScopeInput = normalizeAdminScope(req.body?.adminScope);

    if (!email || !password || !roleRaw) {
      return res.status(400).json({ error: { code: "VALIDATION", message: "Missing fields" } });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: { code: "VALIDATION", message: passwordError } });
    }

    if (!VALID_ROLES.includes(roleRaw as Role)) {
      return res.status(400).json({ error: { code: "VALIDATION", message: "Invalid role" } });
    }

    const role = roleRaw as Role;
    if (role === "ADMIN" && getEffectiveAdminScope(req.user ?? {}) !== "SUPER") {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Only Super Admin can create admin accounts",
        },
      });
    }

    if (role === "ADMIN" && req.body?.adminScope !== undefined && !adminScopeInput) {
      return res.status(400).json({ error: { code: "VALIDATION", message: "Invalid adminScope" } });
    }

    if (role === "STUDENT") {
      if (!southAfricanId) {
        return res.status(400).json({
          error: { code: "VALIDATION", message: "southAfricanId is required for student creation" },
        });
      }
      if (!isValidSouthAfricanId(southAfricanId)) {
        return res.status(400).json({
          error: { code: "VALIDATION", message: "southAfricanId must be exactly 13 digits" },
        });
      }
      if (!studentNumber) {
        return res.status(400).json({
          error: { code: "VALIDATION", message: "studentNumber is required for student creation" },
        });
      }
      if (studentNumber.length > 64) {
        return res.status(400).json({
          error: { code: "VALIDATION", message: "studentNumber must be 64 characters or fewer" },
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const adminScope = role === "ADMIN" ? adminScopeInput ?? "ACADEMIC" : null;
      const result = await pool.query(
        `
          INSERT INTO users (email, password_hash, role, public_student_id, south_african_id, admin_scope)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, email, role, admin_scope
        `,
        [
          email,
          passwordHash,
          role,
          role === "STUDENT" ? studentNumber : null,
          role === "STUDENT" ? southAfricanId : null,
          adminScope,
        ]
      );

      return res.status(201).json({ user: toJwtUser(result.rows[0] as JwtUser & { admin_scope?: string | null }) });
    } catch (e: any) {
      if (String(e?.code ?? "") === "23505") {
        if (role === "STUDENT") {
          try {
            const updated = await pool.query(
              `
                UPDATE users
                SET
                  role = 'STUDENT',
                  public_student_id = COALESCE(public_student_id, $2),
                  south_african_id = COALESCE(south_african_id, $3)
                WHERE lower(email) = lower($1)
                RETURNING id, email, role, admin_scope
              `,
              [email, studentNumber, southAfricanId]
            );

            if ((updated.rowCount ?? 0) > 0) {
              return res.status(200).json({
                user: toJwtUser(updated.rows[0] as JwtUser & { admin_scope?: string | null }),
                updated: true,
              });
            }
          } catch (upsertErr: any) {
            if (String(upsertErr?.code ?? "") !== "23505") {
              return res.status(500).json({
                error: { code: "INTERNAL", message: "Failed to update existing student account" },
              });
            }
          }
        }

        return res.status(400).json({
          error: {
            code: "VALIDATION",
            message: "Account already exists (email, student number, or South African ID)",
          },
        });
      }
      return res.status(500).json({ error: { code: "INTERNAL", message: "Failed to create account" } });
    }
  }
);

/* ===============================
   LOGIN
   POST /login
   Supports:
   - OTP login: { email, password, otp, studentNumber? } // studentNumber required for STUDENT accounts
   - Password-only login: { email, password } when allowed (dev speed)
=================================*/
authRouter.post("/login", loginLimiter, async (req, res) => {
  const { requireOtp, allowPasswordLogin } = authPolicy();

  const email = normEmail(req.body?.email);
  const password = String(req.body?.password ?? "");
  const otp = String(req.body?.otp ?? "").trim();
  const studentNumber = normalizeStudentNumber(req.body?.studentNumber);

  if (!email || !password) {
    return res.status(400).json({ error: { code: "VALIDATION", message: "Missing fields" } });
  }

  // If OTP is required and none provided, block unless password-login is allowed
  if (requireOtp && !otp && !allowPasswordLogin) {
    return res.status(400).json({
      error: { code: "VALIDATION", message: "Missing fields" },
    });
  }

  const result = await pool.query(`SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1`, [email]);
  const userRow = result.rows[0];
  if (!userRow) return res.status(401).json({ error: { code: "AUTH", message: "Invalid credentials" } });

  const match = await bcrypt.compare(password, userRow.password_hash);
  if (!match) return res.status(401).json({ error: { code: "AUTH", message: "Invalid credentials" } });

  // If OTP is provided, verify it
  if (otp) {
    const otpRes = await verifyAndConsumeOtp(email, "LOGIN", otp);
    if (!otpRes.ok) {
      if (otpRes.status === 429) {
        res.setHeader("Retry-After", String(otpConfig().ttlMinutes * 60));
      }
      return res.status(otpRes.status).json({ error: { code: otpRes.code, message: otpRes.message } });
    }
  } else {
    // No OTP supplied
    if (requireOtp && !allowPasswordLogin) {
      return res.status(400).json({
        error: { code: "VALIDATION", message: "OTP required for login" },
      });
    }
  }

  if (String(userRow.role ?? "").toUpperCase() === "STUDENT") {
    if (!studentNumber) {
      return res.status(400).json({
        error: { code: "VALIDATION", message: "studentNumber is required for student login" },
      });
    }
    const expectedStudentNumber = normalizeStudentNumber(userRow.public_student_id);
    if (!expectedStudentNumber || studentNumber !== expectedStudentNumber) {
      return res.status(401).json({ error: { code: "AUTH", message: "Invalid credentials" } });
    }
  }

  const user = toJwtUser(userRow as JwtUser & { admin_scope?: string | null });
  const token = signToken(user);

  return res.json({ token, user });
});

/* ===============================
   ME (protected)
=================================*/
authRouter.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});
