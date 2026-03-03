import { Router } from "express";
import { pool } from "../config/db";
import { pgThreadRepo } from "../repos/pgThreadRepo";
import { canMessage, toMessagingRole } from "../lib/messagingRbac";

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function parseLimit(raw: any, fallback = 50) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

function normEmail(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

export const threadRouter = Router();

// requireAuth is already applied globally in app.ts

// GET /threads?limit=&before=
threadRouter.get("/", async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseLimit(req.query.limit, 50);
    const before = req.query.before ? String(req.query.before) : undefined;

    const out = await pgThreadRepo.listForUser(userId, { limit, before });

    return res.json({
      value: out.threads,
      count: out.threads.length,
      nextBefore: out.nextBefore,
    });
  } catch (e: any) {
    // TEMP DEBUG: remove after Render 500 diagnostics are complete.
    console.error("[THREADS_DEBUG] GET /api/threads failed", {
      err: e,
      stack: e?.stack,
      user: {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
      },
      path: req.path,
      query: req.query,
    });
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// GET /threads/:id
threadRouter.get("/:id", async (req, res) => {
  try {
    const userId = req.user!.id;
    const threadId = req.params.id;

    const thread = await pgThreadRepo.getByIdForUser(threadId, userId);
    return res.json(thread);
  } catch (e: any) {
    const code = e?.code;

    if (code === "NOT_FOUND") {
      return err(res, 404, "NOT_FOUND", e.message ?? "Thread not found");
    }
    if (code === "FORBIDDEN") {
      return err(res, 403, "FORBIDDEN", e.message ?? "Forbidden");
    }
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// POST /threads { participantEmails: string[] }
// Rule: only 1:1 threads, D6 role matrix, no parent<->student, no self
threadRouter.post("/", async (req, res) => {
  try {
    const user = req.user!;
    const userId = user.id;

    const userRole = toMessagingRole((user as { role?: unknown }).role);
    if (!userRole) {
      return err(res, 403, "FORBIDDEN", "Invalid role");
    }

    const raw = req.body?.participantEmails;

    if (!Array.isArray(raw)) {
      return err(res, 400, "VALIDATION", "participantEmails must be an array of emails");
    }

    const cleaned = Array.from(new Set(raw.map(normEmail).filter((e) => e.length > 0)));

    // Must be exactly 1 other participant (1:1 only)
    if (cleaned.length === 0) {
      return err(res, 400, "VALIDATION", "participantEmails is required");
    }
    if (cleaned.length !== 1) {
      return err(
        res,
        400,
        "VALIDATION",
        "Only 1:1 threads are supported (provide exactly 1 participantEmail)"
      );
    }

    const otherEmail = cleaned[0];

    // Load the other user (id + role) so we can enforce D6 matrix and no-self by id
    const ures = await pool.query<{ id: string; role: string; email: string }>(
      `
        SELECT id, role, email
        FROM users
        WHERE lower(email) = lower($1)
        LIMIT 1
      `,
      [otherEmail]
    );

    if (ures.rowCount === 0) {
      return err(res, 400, "VALIDATION", "Participant email does not exist");
    }

    const otherUserId = ures.rows[0].id;
    const otherRole = toMessagingRole(ures.rows[0].role);

    if (!otherRole) {
      return err(res, 403, "FORBIDDEN", "Participant has invalid role");
    }

    // Prevent self-thread (by id, strongest guarantee)
    if (otherUserId === userId) {
      return err(res, 400, "VALIDATION", "Cannot create a thread with only yourself");
    }

    // Enforce D6 role matrix
    if (!canMessage(userRole, otherRole) || !canMessage(otherRole, userRole)) {
      return err(res, 403, "FORBIDDEN", "Direct messaging is not allowed between these roles");
    }

    // Delegate the rest (duplicate prevention, etc.) to the repo
    const out = await pgThreadRepo.createThread(userId, cleaned);

    return res.status(out.created ? 201 : 200).json({
      created: out.created,
      ...out.thread,
    });
  } catch (e: any) {
    const code = e?.code;

    if (code === "VALIDATION") {
      return err(res, 400, "VALIDATION", e.message ?? "Invalid request");
    }
    if (code === "FORBIDDEN") {
      return err(res, 403, "FORBIDDEN", e.message ?? "Forbidden");
    }
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// GET /threads/:id/messages?limit=&before=
threadRouter.get("/:id/messages", async (req, res) => {
  try {
    const userId = req.user!.id;
    const threadId = req.params.id;

    const limit = parseLimit(req.query.limit, 50);
    const before = req.query.before ? String(req.query.before) : undefined;

    const out = await pgThreadRepo.listMessages(threadId, userId, { limit, before });

    return res.json({
      value: out.messages,
      count: out.messages.length,
      nextBefore: out.nextBefore,
    });
  } catch (e: any) {
    const code = e?.code;
    if (code === "FORBIDDEN") {
      return err(res, 403, "FORBIDDEN", e.message ?? "Forbidden");
    }
    if (code === "NOT_FOUND") {
      return err(res, 404, "NOT_FOUND", e.message ?? "Thread not found");
    }
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// POST /threads/:id/messages { body }
threadRouter.post("/:id/messages", async (req, res) => {
  try {
    const userId = req.user!.id;
    const threadId = req.params.id;
    const body = req.body?.body;

    const msg = await pgThreadRepo.createMessage(threadId, userId, body);
    return res.status(201).json(msg);
  } catch (e: any) {
    const code = e?.code;

    if (code === "VALIDATION") {
      return err(res, 400, "VALIDATION", e.message ?? "Invalid request");
    }
    if (code === "FORBIDDEN") {
      return err(res, 403, "FORBIDDEN", e.message ?? "Forbidden");
    }
    if (code === "NOT_FOUND") {
      return err(res, 404, "NOT_FOUND", e.message ?? "Thread not found");
    }
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// POST /threads/:id/archive
threadRouter.post("/:id/archive", async (req, res) => {
  try {
    const userId = req.user!.id;
    const threadId = req.params.id;

    await pgThreadRepo.archiveForUser(threadId, userId);
    return res.json({ ok: true });
  } catch (e: any) {
    const code = e?.code;
    if (code === "FORBIDDEN") return err(res, 403, "FORBIDDEN", e.message ?? "Forbidden");
    if (code === "NOT_FOUND") return err(res, 404, "NOT_FOUND", e.message ?? "Thread not found");
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});

// POST /threads/:id/unarchive
threadRouter.post("/:id/unarchive", async (req, res) => {
  try {
    const userId = req.user!.id;
    const threadId = req.params.id;

    await pgThreadRepo.unarchiveForUser(threadId, userId);
    return res.json({ ok: true });
  } catch (e: any) {
    const code = e?.code;
    if (code === "FORBIDDEN") return err(res, 403, "FORBIDDEN", e.message ?? "Forbidden");
    if (code === "NOT_FOUND") return err(res, 404, "NOT_FOUND", e.message ?? "Thread not found");
    return err(res, 500, "INTERNAL", "Unexpected error");
  }
});
