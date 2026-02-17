import express from "express";
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

function buildCorsOrigins(): string[] {
  const raw = String(process.env.CORS_ORIGIN ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  app.use(express.json({ limit: "1mb" }));

  const allowedOrigins = buildCorsOrigins();

  const corsOptions: CorsOptions = {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      if (allowedOrigins.length === 0) {
        const isDev = (process.env.NODE_ENV ?? "development") === "development";
        return cb(null, isDev);
      }

      const ok = allowedOrigins.includes(origin);
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

  // ✅ FIXED: uploads are mounted at /api/uploads
  app.use("/api/uploads", uploadRouter);

  app.use("/api/parent", parentRouter);
  app.use("/api/threads", threadRouter);
  app.use("/api", calendarRouter);
  app.use("/api", financeRouter);

  return app;
}
