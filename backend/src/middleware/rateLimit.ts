import type { Request } from "express";
import rateLimit from "express-rate-limit";

const TOO_MANY_REQUESTS_MESSAGE = { error: "Too many requests. Try again later." };

function stableRateLimitKey(req: Request): string {
  const cfConnectingIp = req.header("cf-connecting-ip");
  const fallbackIp = req.ip;
  const key = String(cfConnectingIp ?? fallbackIp ?? "").trim();
  return key || "unknown-ip";
}

function isProductionEnv(): boolean {
  const nodeEnv = String(process.env.NODE_ENV ?? "").toLowerCase();
  const appEnv = String(process.env.APP_ENV ?? "").toLowerCase();
  return nodeEnv === "production" || appEnv === "production";
}

function isLocalLoopbackIp(ip: string): boolean {
  const normalized = String(ip ?? "").trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "::ffff:127.0.0.1";
}

function shouldSkipRateLimit(req: Request): boolean {
  if (isProductionEnv()) return false;
  return isLocalLoopbackIp(stableRateLimitKey(req));
}

function createLimiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => stableRateLimitKey(req),
    skip: (req) => shouldSkipRateLimit(req),
    standardHeaders: true,
    legacyHeaders: false,
    message: TOO_MANY_REQUESTS_MESSAGE,
  });
}

export const loginLimiter = createLimiter(15 * 60 * 1000, 10);
export const registerLimiter = createLimiter(15 * 60 * 1000, 10);
export const uploadLimiter = createLimiter(10 * 60 * 1000, 20);
export const messageLimiter = createLimiter(60 * 1000, 60);
