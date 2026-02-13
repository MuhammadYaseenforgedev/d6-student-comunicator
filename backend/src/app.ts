import express from "express";
import cors from "cors";

import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";

import { requireAuth } from "./middleware/auth";

import { channelRouter } from "./routes/channels";
import { announcementRouter } from "./routes/announcements";
import { messageRouter } from "./routes/messages";
import { eventRouter } from "./routes/events";
import { uploadRouter } from "./routes/uploads";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Public routes
  app.use(healthRouter);
  app.use(authRouter);

  // Everything below requires a valid Bearer token
  app.use(requireAuth);

  // Protected routes
  app.use("/channels", channelRouter);
  app.use(announcementRouter);
  app.use(messageRouter);
  app.use(eventRouter);
  app.use(uploadRouter);

  return app;
}
