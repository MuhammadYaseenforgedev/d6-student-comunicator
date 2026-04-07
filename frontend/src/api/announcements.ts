// frontend/src/api/announcements.ts

import type { Announcement, AnnouncementCreate, ChannelKey } from "../lib/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { getUser } from "../lib/auth";
import {
  addAnnouncement,
  deleteAnnouncementLocal,
  ensureDemoSeeded,
  getAnnouncementsByChannel,
  updateAnnouncementLocal,
} from "../lib/announcementStore";
import { isMockDataEnabled } from "../lib/devMode";

// The backend mounts apiListWrapper under /api, which wraps any array JSON body as:
//   { value: [...], count: number }
// Therefore list endpoints called under /api must unwrap `value`.



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
  type: string; // e.g. "MODULE", "FACULTY", "CLUBS", "EMERGENCY"
  isPrivate?: boolean;
  createdBy?: string;
  members?: string[];
  createdAt?: string;
};

type BackendAnnouncement = {
  id: string;
  channelId: string;
  moduleId?: string | null;
  moduleCode?: string | null;
  moduleName?: string | null;
  title: string;
  body: string;
  pinned?: boolean;
  createdBy?: string;
  createdAt?: string;
};

const CHANNEL_NAME: Record<ChannelKey, string> = {
  general: "General",
  modules: "Modules",
  faculty: "Faculty",
  clubs: "Clubs",
  emergency: "Emergency",
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

  const desiredName = CHANNEL_NAME[channelKey];

  // Prefer name match (handles MODULE duplicates safely)
  const byName = channels.find((c) => norm(c.name) === norm(desiredName));
  if (byName) return byName.id;

  // Keep dashboard usable if names differ
  if (channelKey === "general") return channels[0].id;

  const available = channels.map((c) => c.name).join(", ");
  throw new Error(`Backend channel "${desiredName}" not found. Available: ${available}`);
}

function toUiAnnouncement(row: BackendAnnouncement, channel: ChannelKey): Announcement {
  const me = getUser();
  const createdBy = row.createdBy ?? "";

  // Backend returns createdBy as a user id; UI prefers readable label.
  const author =
    me && createdBy && createdBy === me.id ? me.email : createdBy || "System";

  return {
    id: row.id,
    channel, // keep ChannelKey here (not channelId)
    title: row.title,
    body: row.body,
    pinned: Boolean(row.pinned ?? false),
    author,
    createdAt: row.createdAt ?? new Date().toISOString(),
    moduleId: row.moduleId ?? null,
    moduleCode: row.moduleCode ?? null,
    moduleName: row.moduleName ?? null,
  };
}

export async function fetchAnnouncements(
  channel: ChannelKey,
  opts?: { moduleId?: string }
): Promise<Announcement[]> {
  if (isMockDataEnabled()) {
    ensureDemoSeeded();
    const rows = getAnnouncementsByChannel(channel);
    if (channel !== "modules" || !opts?.moduleId?.trim()) {
      return rows;
    }
    const moduleId = opts.moduleId.trim();
    return rows.filter((row) => row.moduleId === moduleId);
  }

  const channelId = await resolveChannelId(channel);
  const qs = new URLSearchParams();
  if (channel === "modules" && opts?.moduleId?.trim()) {
    qs.set("moduleId", opts.moduleId.trim());
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const raw = await apiGet<unknown>(`/api/channels/${channelId}/announcements${suffix}`);
  const rows = unwrapList<BackendAnnouncement>(raw);

  return rows.map((r) => toUiAnnouncement(r, channel));
}

export async function createAnnouncement(payload: AnnouncementCreate): Promise<Announcement> {
  if (isMockDataEnabled()) {
    ensureDemoSeeded();
    return addAnnouncement(payload);
  }

  const channelId = await resolveChannelId(payload.channel);

  const created = await apiPost<BackendAnnouncement>(
    `/api/channels/${channelId}/announcements`,
    {
      title: payload.title,
      body: payload.body,
      pinned: payload.pinned,
      ...(payload.channel === "modules" && payload.moduleId
        ? { moduleId: payload.moduleId }
        : {}),
    }
  );

  return toUiAnnouncement(created, payload.channel);
}

type AnnouncementUpdateInput = {
  channel: ChannelKey;
  id: string;
  title?: string;
  body?: string;
  pinned?: boolean;
};

export async function updateAnnouncement(input: AnnouncementUpdateInput): Promise<Announcement> {
  if (isMockDataEnabled()) {
    ensureDemoSeeded();
    const current = getAnnouncementsByChannel(input.channel).find((item) => item.id === input.id);
    if (!current) {
      throw new Error("Announcement not found.");
    }
    return updateAnnouncementLocal(input.id, {
      title: input.title ?? current.title,
      body: input.body ?? current.body,
      pinned: input.pinned ?? current.pinned,
    });
  }

  const channelId = await resolveChannelId(input.channel);
  const updated = await apiPatch<BackendAnnouncement>(
    `/api/channels/${channelId}/announcements/${input.id}`,
    {
      ...(typeof input.title === "string" ? { title: input.title } : {}),
      ...(typeof input.body === "string" ? { body: input.body } : {}),
      ...(typeof input.pinned === "boolean" ? { pinned: input.pinned } : {}),
    }
  );
  return toUiAnnouncement(updated, input.channel);
}

export async function deleteAnnouncement(input: {
  channel: ChannelKey;
  id: string;
}): Promise<void> {
  if (isMockDataEnabled()) {
    ensureDemoSeeded();
    deleteAnnouncementLocal(input.id);
    return;
  }

  const channelId = await resolveChannelId(input.channel);
  await apiDelete<{ ok: boolean }>(
    `/api/channels/${channelId}/announcements/${input.id}`
  );
}

export function invalidateChannelCache() {
  channelCache = null;
  channelCacheAt = 0;
}
