// src/routes/health.ts
import { Router } from "express";
import type { Request, Response } from "express";

export const healthRouter = Router();

const SERVICE_NAME = "d6-student-comunicator";

function healthPayload() {
  return {
    ok: true,
    service: SERVICE_NAME,
    time: new Date().toISOString(),
  };
}

// GET /health and GET /api/health
healthRouter.get("/", (_req: Request, res: Response) => {
  return res.json(healthPayload());
});

// Optional extended status endpoint
healthRouter.get("/status", (_req: Request, res: Response) => {
  return res.json({
    ...healthPayload(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});
