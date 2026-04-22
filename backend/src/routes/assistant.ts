import { Router, type Response } from "express";
import { assistantLimiter } from "../middleware/rateLimit";
import {
  createAssistantReply,
  isOpenAiAssistantConfigured,
  type AssistantTurn,
} from "../lib/openaiAssistant";
import type { AuthUser, Role } from "../middleware/auth";

type AssistantActionPayload = {
  id: string;
  label: string;
  description: string;
};

type AssistantDestinationPayload = {
  id: string;
  label: string;
  path: string;
  description: string;
};

function err(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function clipText(value: unknown, maxLength: number): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeMode(value: unknown): "login" | "register" | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "login" || normalized === "register" ? normalized : null;
}

function normalizeRole(value: unknown): Role | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return ["ADMIN", "LECTURER", "STUDENT", "PARENT"].includes(normalized)
    ? (normalized as Role)
    : null;
}

function normalizeHistory(value: unknown): AssistantTurn[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const role = String(row.role ?? "").trim().toLowerCase();
      const text = clipText(row.text, 1200);
      if (!text) return null;
      if (role !== "assistant" && role !== "user") return null;
      return {
        role: role as AssistantTurn["role"],
        text,
      };
    })
    .filter((entry): entry is AssistantTurn => Boolean(entry))
    .slice(-8);
}

function normalizeActions(value: unknown): AssistantActionPayload[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = clipText(row.id, 80);
      const label = clipText(row.label, 80);
      const description = clipText(row.description, 220);
      if (!id || !label) return null;
      return {
        id,
        label,
        description,
      };
    })
    .filter((entry): entry is AssistantActionPayload => Boolean(entry))
    .slice(0, 8);
}

function normalizeDestinations(value: unknown): AssistantDestinationPayload[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = clipText(row.id, 80);
      const label = clipText(row.label, 80);
      const path = clipText(row.path, 180);
      const description = clipText(row.description, 280);
      if (!id || !label || !path) return null;
      return {
        id,
        label,
        path,
        description,
      };
    })
    .filter((entry): entry is AssistantDestinationPayload => Boolean(entry))
    .slice(0, 20);
}

function roleLabel(role: Role, adminScope?: AuthUser["adminScope"]): string {
  if (role !== "ADMIN") {
    return role.charAt(0) + role.slice(1).toLowerCase();
  }

  if (adminScope === "SUPER") return "Super Admin";
  if (adminScope === "FINANCE") return "Finance Admin";
  return "Academic Admin";
}

function formatActions(actions: AssistantActionPayload[]): string {
  if (actions.length === 0) return "No quick actions were provided.";

  return actions
    .map((action) =>
      action.description
        ? `- ${action.label} (${action.id}): ${action.description}`
        : `- ${action.label} (${action.id})`
    )
    .join("\n");
}

function formatDestinations(destinations: AssistantDestinationPayload[]): string {
  if (destinations.length === 0) return "No destination list was provided.";

  return destinations
    .map((destination) =>
      destination.description
        ? `- ${destination.label} (${destination.path}): ${destination.description}`
        : `- ${destination.label} (${destination.path})`
    )
    .join("\n");
}

function buildAuthInstructions(assistantName: string): string {
  return [
    `You are ${assistantName}, an AI guide for the D6 Student Communicator authentication flow.`,
    "Help users complete login or registration and understand the next step in the app.",
    "Use only the steps, fields, and shortcuts described in the provided context.",
    "Do not invent policies, screens, permissions, or backend actions that are not in the context.",
    "You do not have access to live account records, OTP inboxes, or server state.",
    "If the user is blocked, guide them to the support desk when that option is present in context.",
    "Keep replies friendly, plain text, and limited to four short sentences.",
  ].join(" ");
}

function buildAppInstructions(assistantName: string, currentRole: string): string {
  return [
    `You are ${assistantName}, an AI navigation assistant for the D6 Student Communicator app.`,
    `You are helping a signed-in ${currentRole}.`,
    "Use only the allowed pages and descriptions provided in the context.",
    "Do not invent routes, permissions, records, or account-specific data.",
    "If the user asks for live data you cannot see, explain the right page to visit instead of pretending to know the answer.",
    "Prefer page labels that exist in the allowed destination list and keep replies friendly, plain text, and limited to five short sentences.",
  ].join(" ");
}

export const assistantPublicRouter = Router();
export const assistantProtectedRouter = Router();

assistantPublicRouter.post("/auth", assistantLimiter, async (req, res) => {
  const message = clipText(req.body?.message, 1200);
  const mode = normalizeMode(req.body?.mode);
  const role = normalizeRole(req.body?.role);
  const history = normalizeHistory(req.body?.history);
  const contextTitle = clipText(req.body?.contextTitle, 120);
  const contextSummary = clipText(req.body?.contextSummary, 500);
  const assistantName = clipText(req.body?.assistantName, 60) || "Beacon";
  const assistantSubtitle = clipText(req.body?.assistantSubtitle, 80);
  const canRequestOtp = Boolean(req.body?.canRequestOtp);
  const quickActions = normalizeActions(req.body?.quickActions);

  if (!message || !mode || !role) {
    return err(res, 400, "VALIDATION", "message, mode, and role are required");
  }

  if (!isOpenAiAssistantConfigured()) {
    return err(
      res,
      503,
      "OPENAI_NOT_CONFIGURED",
      "AI assistant is not configured on the backend"
    );
  }

  try {
    const reply = await createAssistantReply({
      instructions: buildAuthInstructions(assistantName),
      userMessage: message,
      history,
      contextSections: [
        {
          title: "Assistant profile",
          body: [`Name: ${assistantName}`, assistantSubtitle ? `Focus: ${assistantSubtitle}` : ""]
            .filter(Boolean)
            .join("\n"),
        },
        {
          title: "Current auth context",
          body: [
            `Mode: ${mode}`,
            `Selected role: ${roleLabel(role)}`,
            contextTitle ? `Guidance title: ${contextTitle}` : "",
            contextSummary ? `Guidance summary: ${contextSummary}` : "",
            canRequestOtp
              ? "OTP shortcut is currently available."
              : "OTP shortcut is not currently available until the user enters their email first.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
        {
          title: "Quick actions",
          body: formatActions(quickActions),
        },
      ],
    });

    return res.json({
      text: reply.text,
      model: reply.model,
      source: "openai",
    });
  } catch (error) {
    console.error("[assistant] POST /assistant/auth error", error);
    return err(res, 502, "OPENAI_FAILED", "Failed to generate assistant reply");
  }
});

assistantProtectedRouter.post("/app", assistantLimiter, async (req, res) => {
  const message = clipText(req.body?.message, 1200);
  const history = normalizeHistory(req.body?.history);
  const pathname = clipText(req.body?.pathname, 180) || "/app";
  const contextTitle = clipText(req.body?.contextTitle, 120);
  const contextSummary = clipText(req.body?.contextSummary, 500);
  const assistantName = clipText(req.body?.assistantName, 60) || "Guide";
  const assistantSubtitle = clipText(req.body?.assistantSubtitle, 80);
  const overview = clipText(req.body?.overview, 600);
  const destinations = normalizeDestinations(req.body?.destinations);
  const user = req.user;

  if (!message) {
    return err(res, 400, "VALIDATION", "message is required");
  }

  if (!user) {
    return err(res, 401, "AUTH", "Authentication is required");
  }

  if (!isOpenAiAssistantConfigured()) {
    return err(
      res,
      503,
      "OPENAI_NOT_CONFIGURED",
      "AI assistant is not configured on the backend"
    );
  }

  try {
    const currentRole = roleLabel(user.role, user.adminScope);
    const reply = await createAssistantReply({
      instructions: buildAppInstructions(assistantName, currentRole),
      userMessage: message,
      history,
      contextSections: [
        {
          title: "Assistant profile",
          body: [`Name: ${assistantName}`, assistantSubtitle ? `Focus: ${assistantSubtitle}` : ""]
            .filter(Boolean)
            .join("\n"),
        },
        {
          title: "Signed-in user context",
          body: [
            `Role: ${currentRole}`,
            `Current route: ${pathname}`,
            contextTitle ? `Current guidance title: ${contextTitle}` : "",
            contextSummary ? `Current guidance summary: ${contextSummary}` : "",
            overview ? `Role overview: ${overview}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
        {
          title: "Allowed destinations",
          body: formatDestinations(destinations),
        },
      ],
    });

    return res.json({
      text: reply.text,
      model: reply.model,
      source: "openai",
    });
  } catch (error) {
    console.error("[assistant] POST /assistant/app error", error);
    return err(res, 502, "OPENAI_FAILED", "Failed to generate assistant reply");
  }
});
