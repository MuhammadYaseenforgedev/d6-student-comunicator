import express from "express";
import cors from "cors";
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

function buildCorsOrigins(): string[] | null {
  const raw = String(process.env.CORS_ORIGIN ?? "").trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createApp() {
  const app = express();

  // Important for correct req.ip behind proxies (Render/AWS/nginx)
  // If you are not behind a proxy, this is still fine.
  app.set("trust proxy", 1);

  // Security headers
  app.use(
    helmet({
      // Keep defaults. If you later serve frontend from same server you can tune CSP.
      contentSecurityPolicy: false,
    })
  );

  // JSON limit (avoid huge payload DOS)
  app.use(express.json({ limit: "1mb" }));

  // CORS
  const origins = buildCorsOrigins();
  app.use(
    cors({
      origin: origins ?? true, // if not set, allow all in dev
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    })
  );

  // Public routes (legacy)
  app.use(healthRouter);
  app.use(authRouter);

  // Public routes (/api preferred)
  app.use("/api", apiListWrapper);
  app.use("/api", healthRouter);
  app.use("/api", authRouter);

  // Everything below requires a valid Bearer token
  app.use(requireAuth);

  // Protected routes (legacy)
  app.use("/channels", channelRouter);
  app.use(announcementRouter);
  app.use(messageRouter);
  app.use(eventRouter);
  app.use(uploadRouter);
  app.use("/parent", parentRouter);
  app.use("/threads", threadRouter);
  app.use(calendarRouter);
  app.use(financeRouter);

  // Protected routes (/api preferred)
  app.use("/api", apiListWrapper);
  app.use("/api/channels", channelRouter);
  app.use("/api", announcementRouter);
  app.use("/api", messageRouter);
  app.use("/api", eventRouter);
  app.use("/api", uploadRouter);
  app.use("/api/parent", parentRouter);
  app.use("/api/threads", threadRouter);
  app.use("/api", calendarRouter);
  app.use("/api", financeRouter);

  return app;
}
