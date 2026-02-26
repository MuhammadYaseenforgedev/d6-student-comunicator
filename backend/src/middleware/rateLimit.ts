import rateLimit from "express-rate-limit";

const TOO_MANY_REQUESTS_MESSAGE = { error: "Too many requests. Try again later." };

function createLimiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: TOO_MANY_REQUESTS_MESSAGE,
  });
}

export const loginLimiter = createLimiter(15 * 60 * 1000, 10);
export const registerLimiter = createLimiter(15 * 60 * 1000, 10);
export const uploadLimiter = createLimiter(10 * 60 * 1000, 20);
export const messageLimiter = createLimiter(60 * 1000, 60);
