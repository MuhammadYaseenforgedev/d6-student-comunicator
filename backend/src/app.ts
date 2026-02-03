import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { fakeAuth } from "./middleware/rbac";
import { channelRouter } from "./routes/channels";

  

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use(fakeAuth);

  app.use(healthRouter);
  app.use("/channels", channelRouter);

  return app;
}
