import type { Request } from "express";
import rateLimit from "express-rate-limit";

const TOO_MANY_REQUESTS_MESSAGE = { error: "Too many requests. Try again later." };

function isProductionEnv(): boolean {
  const nodeEnv = String(process.env.NODE_ENV ?? "").trim().toLowerCase();
  const appEnv = String(process.env.APP_ENV ?? "").trim().toLowerCase();
  return nodeEnv === "production" || appEnv === "production";
}

function isLocalLoopbackIp(ip: string): boolean {
  const normalizedIp = String(ip ?? "").trim();
  return (
    normalizedIp === "127.0.0.1" ||
    normalizedIp === "::1" ||
    normalizedIp === "::ffff:127.0.0.1"
  );
}

function stableRateLimitKey(req: Request): string {
  const cfConnectingIp = req.header("cf-connecting-ip");
  const fallbackIp = req.ip;
  const key = String(cfConnectingIp ?? fallbackIp ?? "").trim();
  return key || "unknown-ip";
}

function shouldSkipRateLimit(req: Request): boolean {
  if (isProductionEnv()) return false;
  const cfConnectingIp = req.header("cf-connecting-ip");
  const candidateIps = [cfConnectingIp, req.ip];
  return candidateIps.some((ip) => isLocalLoopbackIp(String(ip ?? "")));
}

function createLimiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    skip: (req) => shouldSkipRateLimit(req),
    keyGenerator: (req) => stableRateLimitKey(req),
    standardHeaders: true,
    legacyHeaders: false,
    message: TOO_MANY_REQUESTS_MESSAGE,
  });
}

export const loginLimiter = createLimiter(15 * 60 * 1000, 10);
export const registerLimiter = createLimiter(15 * 60 * 1000, 10);
export const uploadLimiter = createLimiter(10 * 60 * 1000, 20);
export const messageLimiter = createLimiter(60 * 1000, 60);
export const assistantLimiter = createLimiter(60 * 1000, 20);
