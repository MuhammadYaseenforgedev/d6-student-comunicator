// frontend/src/api/channels.ts

import { apiGet, apiPost } from "../lib/api";

export type Channel = {
  id: string;
  name: string;
  type: string;
  isPrivate: boolean;
  createdBy?: string;
  members?: string[];
  createdAt?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];

  if (isRecord(data)) {
    const value = data["value"];
    if (Array.isArray(value)) return value as T[];
  }

  return [];
}

export async function listChannels(): Promise<Channel[]> {
  const raw = await apiGet<unknown>("/api/channels");
  return unwrapList<Channel>(raw);
}

export async function createChannel(payload: {
  name: string;
  type: string;
  isPrivate?: boolean;
}): Promise<Channel> {
  return apiPost<Channel>("/api/channels", payload);
}
