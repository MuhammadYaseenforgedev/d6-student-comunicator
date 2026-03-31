import { env } from "../config/env";

export type AssistantTurn = {
  role: "assistant" | "user";
  text: string;
};

type AssistantContextSection = {
  title: string;
  body: string;
};

type CreateAssistantReplyInput = {
  instructions: string;
  userMessage: string;
  history?: AssistantTurn[];
  contextSections?: AssistantContextSection[];
  maxOutputTokens?: number;
};

type OpenAiTextPart = {
  type?: string;
  text?: string;
};

type OpenAiOutputItem = {
  type?: string;
  role?: string;
  content?: OpenAiTextPart[];
};

type OpenAiResponseBody = {
  error?: {
    message?: string;
  };
  output?: OpenAiOutputItem[];
  output_text?: string;
};

function clipText(value: unknown, maxLength: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatSections(sections: AssistantContextSection[]): string {
  return sections
    .filter((section) => section.title.trim() && section.body.trim())
    .map((section) => `## ${section.title}\n${section.body}`)
    .join("\n\n");
}

function formatHistory(history: AssistantTurn[]): string {
  return history
    .filter((turn) => turn.text.trim())
    .slice(-8)
    .map((turn) => `${turn.role === "assistant" ? "Assistant" : "User"}: ${clipText(turn.text, 600)}`)
    .join("\n");
}

function buildInput({
  userMessage,
  history = [],
  contextSections = [],
}: CreateAssistantReplyInput): string {
  const promptParts = [
    formatSections(contextSections),
    history.length > 0 ? `## Recent conversation\n${formatHistory(history)}` : "",
    `## Latest user message\n${clipText(userMessage, 1200)}`,
    "## Output rules\nReply in plain text only. Keep it concise, practical, and grounded in the provided app context.",
  ].filter(Boolean);

  return promptParts.join("\n\n");
}

function extractOutputText(body: OpenAiResponseBody): string {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }

  const parts =
    body.output
      ?.filter((item) => item.type === "message" && item.role === "assistant")
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text" && typeof part.text === "string")
      .map((part) => String(part.text ?? "").trim())
      .filter(Boolean) ?? [];

  return parts.join("\n\n").trim();
}

export function isOpenAiAssistantConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export async function createAssistantReply(
  input: CreateAssistantReplyInput
): Promise<{ text: string; model: string }> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_NOT_CONFIGURED");
  }

  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable. Use Node 18 or newer for the AI assistant.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_ASSISTANT_MODEL,
      instructions: input.instructions,
      input: buildInput(input),
      max_output_tokens: input.maxOutputTokens ?? 320,
      store: false,
    }),
  });

  const body = (await response.json().catch(() => null)) as OpenAiResponseBody | null;

  if (!response.ok) {
    const message =
      body?.error?.message?.trim() ||
      `OpenAI request failed with status ${response.status}`;
    throw new Error(message);
  }

  const text = extractOutputText(body ?? {});
  if (!text) {
    throw new Error("OpenAI returned an empty assistant reply.");
  }

  return {
    text,
    model: env.OPENAI_ASSISTANT_MODEL,
  };
}
