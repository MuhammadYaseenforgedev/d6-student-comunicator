import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";

type SendOtpEmailParams = {
  to: string;
  code: string;
  expiresAt?: string | Date | null;
};

let warnedMissingConfig = false;
let transporter: Transporter | null = null;

function missingKeys(): string[] {
  const out: string[] = [];
  if (!env.SMTP_HOST) out.push("SMTP_HOST");
  if (!env.SMTP_USER) out.push("SMTP_USER");
  if (!env.SMTP_PASS) out.push("SMTP_PASS");
  if (!env.SMTP_FROM) out.push("SMTP_FROM");
  return out;
}

export function isSmtpConfigured(): boolean {
  const ok = missingKeys().length === 0;
  if (!ok && !warnedMissingConfig) {
    warnedMissingConfig = true;
    console.warn(
      `[mailer] SMTP is not configured. Missing: ${missingKeys().join(", ")}. OTP email delivery is disabled.`
    );
  }
  return ok;
}

function getTransporter(): Transporter {
  if (!isSmtpConfigured()) {
    throw new Error("OTP email service is not configured");
  }

  if (!transporter) {
    console.info("[mailer] Creating SMTP transporter", {
      host: env.SMTP_HOST ?? null,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      hasUser: Boolean(env.SMTP_USER),
    });

    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
    transporter
      .verify()
      .then(() => console.log("[SMTP] connection OK"))
      .catch((err) => console.error("[SMTP] connection FAILED", err));
  }

  return transporter;
}

function formatExpiry(expiresAt?: string | Date | null): string | null {
  if (!expiresAt) return null;
  const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function sendOtpEmail(params: SendOtpEmailParams): Promise<void> {
  const to = String(params.to ?? "").trim();
  const code = String(params.code ?? "").trim();
  if (!to || !code) {
    throw new Error("OTP email send requires both recipient and code");
  }

  const expiry = formatExpiry(params.expiresAt);
  const expiryLine = expiry ? `This code expires at ${expiry}.` : "This code will expire shortly.";
  const subject = "Your Forge Academy OTP code";
  const text = [`Your one-time password (OTP) code is: ${code}`, expiryLine, "If you did not request this code, ignore this email."].join("\n");
  const html = [
    "<p>Your one-time password (OTP) code is:</p>",
    `<p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p>`,
    `<p>${expiryLine}</p>`,
    "<p>If you did not request this code, you can ignore this email.</p>",
  ].join("");

  try {
    await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      text,
      html,
    });
  } catch (e) {
    const err = e as {
      message?: string;
      code?: string;
      response?: string;
      responseCode?: number;
      command?: string;
      stack?: string;
    };
    console.error("[mailer] sendMail failed", {
      to,
      message: err?.message ?? String(e),
      code: err?.code ?? null,
      responseCode: typeof err?.responseCode === "number" ? err.responseCode : null,
      response: typeof err?.response === "string" ? err.response : null,
      command: typeof err?.command === "string" ? err.command : null,
      stack: err?.stack,
    });
    throw new Error("Failed to send OTP email", { cause: e });
  }
}
