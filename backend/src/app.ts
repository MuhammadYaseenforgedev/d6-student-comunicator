import express from "express";
import cors from "cors";

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

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

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
