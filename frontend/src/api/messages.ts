// frontend/src/api/messages.ts

import type { ChannelKey } from "../lib/types";
import { apiGet, apiPost, apiDelete } from "../lib/api";
import { getUser } from "../lib/auth";

/**
 * Backend mounts apiListWrapper under /api, which wraps array responses as:
 *   { value: [...], count: number }
 * So list endpoints under /api must unwrap `value`.
 */

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

type BackendChannel = {
  id: string;
  name: string;
  type: string; // "MODULE" | "FACULTY" | "CLUBS" | "EMERGENCY"
};

type BackendMessage = {
  id: string;
  channelId: string;
  body: string;
  createdBy?: string;
  createdAt?: string;
};

export type Message = {
  id: string;
  channel: ChannelKey;
  body: string;
  author: string;
  createdAt: string;
};

export type MessageCreate = {
  channel: ChannelKey;
  body: string;
  author?: string; // optional UI convenience
};

const CHANNEL_NAME: Record<ChannelKey, string> = {
  general: "General",
  modules: "Modules",
  faculty: "Faculty",
  clubs: "Clubs",
  emergency: "Emergency",
};

// Prefer by backend TYPE first, then name fallback
const CHANNEL_TYPE: Record<ChannelKey, string> = {
  general: "MODULE",
  modules: "MODULE",
  faculty: "FACULTY",
  clubs: "CLUBS",
  emergency: "EMERGENCY",
};

function norm(s: string) {
  return (s ?? "").trim().toLowerCase();
}

// cache channels for 60s so we don't spam /api/channels
let channelCache: BackendChannel[] | null = null;
let channelCacheAt = 0;
const CHANNEL_CACHE_TTL_MS = 60_000;

async function listChannels(force = false): Promise<BackendChannel[]> {
  const now = Date.now();
  if (!force && channelCache && now - channelCacheAt < CHANNEL_CACHE_TTL_MS) {
    return channelCache;
  }

  const raw = await apiGet<unknown>("/api/channels");
  const channels = unwrapList<BackendChannel>(raw);

  channelCache = channels;
  channelCacheAt = now;
  return channels;
}

async function resolveChannelId(channelKey: ChannelKey): Promise<string> {
  const channels = await listChannels();

  if (channels.length === 0) {
    throw new Error("No channels found on backend. Create channels first.");
  }

  // 1) Prefer type match
  const desiredType = CHANNEL_TYPE[channelKey];
  const byType = channels.find((c) => norm(c.type) === norm(desiredType));
  if (byType) return byType.id;

  // 2) Fallback to name match
  const desiredName = CHANNEL_NAME[channelKey];
  const byName = channels.find((c) => norm(c.name) === norm(desiredName));
  if (byName) return byName.id;

  // 3) Keep dashboard usable
  if (channelKey === "general") return channels[0].id;

  const available = channels.map((c) => `${c.name} (${c.type})`).join(", ");
  throw new Error(`Backend channel for "${channelKey}" not found. Available: ${available}`);
}

function toUiMessage(row: BackendMessage, channel: ChannelKey): Message {
  const me = getUser();
  const createdBy = row.createdBy ?? "";

  const author = me && createdBy && createdBy === me.id ? me.email : createdBy || "System";

  return {
    id: row.id,
    channel,
    body: row.body,
    author,
    createdAt: row.createdAt ?? new Date().toISOString(),
  };
}

export async function fetchMessages(channel: ChannelKey): Promise<Message[]> {
  const channelId = await resolveChannelId(channel);

  const raw = await apiGet<unknown>(`/api/channels/${channelId}/messages`);
  const rows = unwrapList<BackendMessage>(raw);

  return rows.map((r) => toUiMessage(r, channel));
}

export async function createMessage(payload: MessageCreate): Promise<Message> {
  const channelId = await resolveChannelId(payload.channel);

  const created = await apiPost<BackendMessage>(`/api/channels/${channelId}/messages`, {
    body: payload.body,
  });

  return toUiMessage(created, payload.channel);
}

export async function deleteMessage(channel: ChannelKey, messageId: string): Promise<void> {
  const channelId = await resolveChannelId(channel);
  await apiDelete<void>(`/api/channels/${channelId}/messages/${messageId}`);
}

export function invalidateChannelCache() {
  channelCache = null;
  channelCacheAt = 0;
}
