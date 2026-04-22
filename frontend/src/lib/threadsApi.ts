// src/lib/threadsApi.ts
// Inbox API client.
// This file is NOT React, so:
// - No hooks
// - No component state
// - No "any"
// It only talks to the backend and returns typed data.

import { getToken } from "./auth";

// ---------- Types that match backend contract ----------

export type ThreadParticipant = {
  email: string;
};

export type Thread = {
  id: string;
  participants: ThreadParticipant[];
  lastMessageAt: string | null;
};

export type ThreadMessage = {
  id: string;
  threadId: string;
  body: string;
  createdBy: string; // userId
  createdAt: string; // ISO timestamp
};

export type DirectoryUserRole = "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";

export type DirectoryUser = {
  id: string;
  email: string;
  role: DirectoryUserRole;
};

// Shared paging envelope used by backend for lists
export type Paged<T> = {
  value: T[];
  count: number;
  nextBefore: string | null; // cursor for the next request
};

// ---------- Config ----------

// Vite env config: required in production deploys.
const BASE_URL = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const API_CONFIG_ERROR = !BASE_URL
  ? "VITE_API_URL is missing. Set it to your backend origin (for example: https://d6-student-comunicator.onrender.com)."
  : null;

// If your backend mounts routes at /api, keep this.
// If your backend already includes /api in BASE_URL, remove "/api" here.
const API_PREFIX = "/api";

function requireBaseUrl(): string {
  if (API_CONFIG_ERROR) throw new Error(API_CONFIG_ERROR);
  return BASE_URL;
}

// ---------- Helpers ----------

function requireToken(): string {
  const token = getToken();
  if (!token) throw new Error("Not authenticated. Please log in again.");
  return token;
}

async function readErrorMessage(res: Response): Promise<string> {
  // Backend can return: { error: { code, message } } OR { error: "..." } OR { message }
  try {
    const data = (await res.json()) as unknown;

    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
    ) {
      const msg = (data as { error: string }).error.trim();
      if (msg) return msg;
    }

    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "object" &&
      (data as { error?: { message?: unknown } }).error &&
      typeof (data as { error: { message?: unknown } }).error.message === "string"
    ) {
      return (data as { error: { message: string } }).error.message;
    }

    if (
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof (data as { message?: unknown }).message === "string"
    ) {
      return (data as { message: string }).message;
    }
  } catch {
    // ignore parse failures
  }

  return `Request failed (${res.status})`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = requireToken();

  const res = await fetch(`${requireBaseUrl()}${API_PREFIX}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }

  // Safe JSON parsing (some endpoints might return empty body later)
  const text = await res.text();
  return (text ? (JSON.parse(text) as T) : ({} as T));
}

// ---------- Public API ----------

export const threadsApi = {
  // GET /api/threads
  // Optional paging: limit + before
  async listThreads(params?: { limit?: number; before?: string }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.before) qs.set("before", params.before);

    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api<Paged<Thread>>(`/threads${suffix}`);
  },

  // GET /api/threads/:id
  async getThread(threadId: string) {
    return api<Thread>(`/threads/${threadId}`);
  },

  // GET /api/threads/:id/messages
  // Optional paging: limit + before (cursor)
  async listMessages(threadId: string, params?: { limit?: number; before?: string }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.before) qs.set("before", params.before);

    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api<Paged<ThreadMessage>>(`/threads/${threadId}/messages${suffix}`);
  },

  // POST /api/threads
  // Body: { participantEmails: ["student1@forge.local"] }
  async createThread(participantEmail: string) {
    return api<Thread & { created: boolean }>(`/threads`, {
      method: "POST",
      body: JSON.stringify({ participantEmails: [participantEmail] }),
    });
  },

  // GET /api/users?role=LECTURER&role=ADMIN
  async listUsers(params?: { roles?: DirectoryUserRole[]; q?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.roles?.length) {
      for (const role of params.roles) qs.append("role", role);
    }
    if (params?.q?.trim()) qs.set("q", params.q.trim());
    if (params?.limit) qs.set("limit", String(params.limit));

    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api<Paged<DirectoryUser>>(`/users${suffix}`);
  },

  // POST /api/threads/:id/messages
  // Body: { body: "Hello" }
  async sendMessage(threadId: string, body: string) {
    return api<ThreadMessage>(`/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  },
};
