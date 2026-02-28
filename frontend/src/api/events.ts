// frontend/src/api/events.ts

import type { ChannelKey } from "../lib/types";
import { apiGet, apiPost } from "../lib/api";
import { getUser } from "../lib/auth";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (isRecord(data)) {
    const value = (data as Record<string, unknown>)["value"];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

type BackendChannel = {
  id: string;
  name: string;
  type: string;
};

type BackendEvent = {
  id: string;
  channelId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  createdBy?: string;
  createdAt?: string;
};

// UI-friendly event type (you can adjust if your UI expects different fields)
export type UiEvent = {
  id: string;
  channel: ChannelKey;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  author: string;
  createdAt: string;
};

const CHANNEL_NAME: Record<ChannelKey, string> = {
  general: "General",
  modules: "Modules",
  faculty: "Faculty",
  clubs: "Clubs",
  emergency: "Emergency",
};

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

  // Prefer by backend TYPE first (most reliable)
  const desiredType = CHANNEL_TYPE[channelKey];
  const byType = channels.find((c) => norm(c.type) === norm(desiredType));
  if (byType) return byType.id;

  // fallback by name
  const desiredName = CHANNEL_NAME[channelKey];
  const byName = channels.find((c) => norm(c.name) === norm(desiredName));
  if (byName) return byName.id;

  if (channelKey === "general") return channels[0].id;

  const available = channels.map((c) => `${c.name} (${c.type})`).join(", ");
  throw new Error(`Backend channel for "${channelKey}" not found. Available: ${available}`);
}

function toUiEvent(row: BackendEvent, channel: ChannelKey): UiEvent {
  const me = getUser();
  const createdBy = row.createdBy ?? "";
  const author = me && createdBy && createdBy === me.id ? me.email : createdBy || "System";

  return {
    id: row.id,
    channel,
    title: row.title,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    author,
    createdAt: row.createdAt ?? new Date().toISOString(),
  };
}

export async function fetchEvents(channel: ChannelKey): Promise<UiEvent[]> {
  const channelId = await resolveChannelId(channel);

  const raw = await apiGet<unknown>(`/api/channels/${channelId}/events`);
  const rows = unwrapList<BackendEvent>(raw);

  return rows.map((r) => toUiEvent(r, channel));
}

export async function createEvent(payload: {
  channel: ChannelKey;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
}): Promise<UiEvent> {
  const channelId = await resolveChannelId(payload.channel);

  const created = await apiPost<BackendEvent>(`/api/channels/${channelId}/events`, {
    title: payload.title,
    description: payload.description,
    location: payload.location,
    startsAt: payload.startsAt,
    endsAt: payload.endsAt,
  });

  return toUiEvent(created, payload.channel);
}

export function invalidateEventsChannelCache() {
  channelCache = null;
  channelCacheAt = 0;
}
