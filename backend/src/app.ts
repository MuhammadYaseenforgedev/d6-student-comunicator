import { messageRouter } from "./routes/messages";
import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { fakeAuth } from "./middleware/rbac";
import { channelRouter } from "./routes/channels";
import { announcementRouter } from "./routes/announcements";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(fakeAuth);
  app.use(healthRouter);
  // channels router defines "/", "/:id/join", etc
  app.use("/channels", channelRouter);
  // announcements router already contains "/channels/:channelId/announcements"
  app.use(announcementRouter);
  app.use(messageRouter);

  return app;
}
