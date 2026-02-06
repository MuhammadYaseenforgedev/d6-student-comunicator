import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { fakeAuth } from "./middleware/rbac";
import { channelRouter } from "./routes/channels";
import { announcementRouter } from "./routes/announcements";
import { messageRouter } from "./routes/messages";
import { eventRouter } from "./routes/events";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(fakeAuth);

  app.use(healthRouter);

  // Channels
  app.use("/channels", channelRouter);

  // Announcements router already includes /channels/:channelId/announcements
  app.use(announcementRouter);

  // Messages / Events routers (whatever paths they define internally)
  app.use(messageRouter);
  app.use(eventRouter);

  return app;
}
