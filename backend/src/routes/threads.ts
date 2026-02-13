import { Router } from "express";
import { pgThreadRepo } from "../repos/pgThreadRepo";

export const threadRouter = Router();

// requireAuth is already applied globally in app.ts

// GET /threads  and  GET /api/threads
threadRouter.get("/", async (req, res) => {
  const userId = req.user!.id;
  const threads = await pgThreadRepo.listForUser(userId);
  return res.json(threads);
});

// POST /threads  and  POST /api/threads
// body: { participantEmails: string[] }
threadRouter.post("/", async (req, res) => {
  const userId = req.user!.id;

  const participantEmails = Array.isArray(req.body?.participantEmails)
    ? req.body.participantEmails
    : [];

  try {
    const thread = await pgThreadRepo.createThread(userId, participantEmails);
    return res.status(201).json(thread);
  } catch (e: any) {
    const msg = String(e?.message ?? "Bad request");

    if (msg.includes("participantEmails is required")) {
      return res.status(400).json({ error: msg });
    }
    if (msg.includes("do not exist")) {
      return res.status(404).json({ error: msg });
    }

    return res.status(400).json({ error: msg });
  }
});

// GET /threads/:id/messages  and  GET /api/threads/:id/messages
threadRouter.get("/:id/messages", async (req, res) => {
  const userId = req.user!.id;
  const threadId = req.params.id;

  try {
    const messages = await pgThreadRepo.listMessages(threadId, userId);
    return res.json(messages);
  } catch (e: any) {
    if (String(e?.message) === "FORBIDDEN") {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.status(400).json({ error: "Bad request" });
  }
});

// POST /threads/:id/messages  and  POST /api/threads/:id/messages
// body: { body: string }
threadRouter.post("/:id/messages", async (req, res) => {
  const userId = req.user!.id;
  const threadId = req.params.id;
  const body = String(req.body?.body ?? "").trim();

  if (!body) return res.status(400).json({ error: "body is required" });

  try {
    const msg = await pgThreadRepo.createMessage(threadId, userId, body);
    return res.status(201).json(msg);
  } catch (e: any) {
    if (String(e?.message) === "FORBIDDEN") {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.status(400).json({ error: "Bad request" });
  }
});
