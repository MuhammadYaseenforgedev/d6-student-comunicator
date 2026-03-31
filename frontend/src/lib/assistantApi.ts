import { apiClient } from "./apiClient";
import type { AssistantDestination, AuthActionId, AuthMode } from "./assistantKnowledge";
import type { UserRole } from "./auth";

export type AssistantChatTurn = {
  role: "assistant" | "user";
  text: string;
};

type AssistantActionPrompt = {
  id: AuthActionId;
  label: string;
  description: string;
};

type AssistantApiReply = {
  text: string;
  model?: string;
  source?: string;
};

type AuthAssistantRequest = {
  message: string;
  history: AssistantChatTurn[];
  mode: AuthMode;
  role: UserRole;
  canRequestOtp: boolean;
  assistantName: string;
  assistantSubtitle: string;
  contextTitle: string;
  contextSummary: string;
  quickActions: AssistantActionPrompt[];
};

type AppAssistantRequest = {
  message: string;
  history: AssistantChatTurn[];
  pathname: string;
  assistantName: string;
  assistantSubtitle: string;
  contextTitle: string;
  contextSummary: string;
  overview: string;
  destinations: AssistantDestination[];
};

export async function askAuthAssistant(
  payload: AuthAssistantRequest
): Promise<AssistantApiReply> {
  return apiClient.post<AssistantApiReply>("/assistant/auth", payload, { auth: false });
}

export async function askAppAssistant(
  payload: AppAssistantRequest
): Promise<AssistantApiReply> {
  return apiClient.post<AssistantApiReply>("/assistant/app", payload);
}
