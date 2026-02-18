// src/routes/health.ts
import { Router } from "express";

export const healthRouter = Router();

// GET /api/health
healthRouter.get("/", (_req, res) => {
  return res.json({ status: "ok" });
});

// GET /api/health/status
healthRouter.get("/status", (_req, res) => {
  return res.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
