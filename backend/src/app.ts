import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { fakeAuth } from "./middleware/rbac";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use(fakeAuth);

  app.use(healthRouter);

  return app;
}
