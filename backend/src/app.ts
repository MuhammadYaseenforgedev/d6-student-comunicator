import express, { type Request, type Response, type NextFunction } from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";

import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";

import { requireAuth } from "./middleware/auth";
import { apiListWrapper } from "./middleware/apiListWrapper";

import { channelRouter } from "./routes/channels";
import { announcementRouter } from "./routes/announcements";
import { messageRouter } from "./routes/messages";
import { eventRouter } from "./routes/events";
import { uploadRouter } from "./routes/uploads";
import { parentRouter } from "./routes/parent";
import { threadRouter } from "./routes/threads";
import { calendarRouter } from "./routes/calendar";
import { financeRouter } from "./routes/finance";
import { userRouter } from "./routes/users";

function buildCorsOrigins(): string[] {
  const raw = String(process.env.CORS_ORIGIN ?? "").trim();
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim().replace(/\/+$/, ""))
        .filter(Boolean)
    )
  );
}

export function createApp() {
  const app = express();

  // Hardening basics
  app.disable("x-powered-by");

  // Needed for correct IPs when behind proxies (Render/Fly/Nginx).
  // If you're local only, it won't break anything.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // CSP later once you lock down frontend assets.
      contentSecurityPolicy: false,
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  const allowedOrigins = buildCorsOrigins();

  const corsOptions: CorsOptions = {
    origin: (origin, cb) => {
      // Allow non-browser clients (curl/postman) and same-origin calls with no Origin header
      if (!origin) return cb(null, true);

      // If no env configured, only allow in development
      if (allowedOrigins.length === 0) {
        const isDev = (process.env.NODE_ENV ?? "development") === "development";
        return cb(null, isDev);
      }

      const normalizedOrigin = String(origin).trim().replace(/\/+$/, "");
      const ok = allowedOrigins.includes(normalizedOrigin);
      return cb(ok ? null : new Error(`CORS blocked origin: ${origin}`), ok);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition"],
    maxAge: 86400,
  };

  app.use(cors(corsOptions));
  app.options(/.*/, cors(corsOptions));

  // =========================
  // Public routes
  // =========================
  app.use("/api", apiListWrapper);
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);

  // =========================
  // Everything below requires auth
  // =========================
  app.use(requireAuth);

  app.use("/api/channels", channelRouter);
  app.use("/api", announcementRouter);
  app.use("/api", messageRouter);
  app.use("/api", eventRouter);

  app.use("/api/uploads", uploadRouter);
  app.use("/api/users", userRouter);

  app.use("/api/parent", parentRouter);
  app.use("/api/threads", threadRouter);
  app.use("/api", calendarRouter);
  app.use("/api", financeRouter);

  // =========================
  // Not Found
  // =========================
  app.use((req: Request, res: Response) => {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Route not found: ${req.method} ${req.originalUrl}`,
      },
    });
  });

  // =========================
  // Error handler (CORS + JSON parse)
  // =========================
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((e: any, req: Request, res: Response, next: NextFunction) => {
    const msg = String(e?.message ?? "");

    if (msg.startsWith("CORS blocked origin:")) {
      return res.status(403).json({
        error: {
          code: "CORS",
          message: msg,
        },
      });
    }

    if (e?.type === "entity.parse.failed" || msg.toLowerCase().includes("unexpected token")) {
      return res.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "Request body contains invalid JSON",
        },
      });
    }

    console.error("[api] unhandled error:", e);
    return res.status(500).json({
      error: {
        code: "INTERNAL",
        message: "Unexpected error",
      },
    });
  });

  return app;
}

// Helpful for Supertest if you want a default importable app instance
export const app = createApp();
