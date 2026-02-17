// frontend/src/lib/api.ts

const RAW_API_URL = (import.meta.env.VITE_API_URL || "").trim();

// If VITE_API_URL is not set, we default to "" and rely on Vite proxy for /api/* in dev.
const API_URL = RAW_API_URL.replace(/\/+$/, "");

function getToken(): string | null {
  return localStorage.getItem("token");
}

function buildHeaders(extra?: HeadersInit): HeadersInit {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}

function joinUrl(base: string, path: string) {
  // base: "" or "http://localhost:4000"
  // path: "/api/uploads"
  if (!base) return path; // keep path absolute-from-origin
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

async function parseJsonOrText(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const msg = obj.message ?? obj.error;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  if (typeof data === "string" && data.trim()) return data;
  return `Request failed (${status})`;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const data = await parseJsonOrText(res);

  if (!res.ok) {
    throw new Error(extractErrorMessage(data, res.status));
  }

  return data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const url = joinUrl(API_URL, path);

  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(),
  });

  return parseResponse<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = joinUrl(API_URL, path);

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return parseResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const url = joinUrl(API_URL, path);

  const res = await fetch(url, {
    method: "DELETE",
    headers: buildHeaders(),
  });

  if (res.status === 204) return undefined as T;
  return parseResponse<T>(res);
}

/**
 * POST multipart/form-data (for file uploads).
 * Do NOT set Content-Type manually (browser sets boundary).
 */
export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const url = joinUrl(API_URL, path);

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    body: form,
  });

  return parseResponse<T>(res);
}

/**
 * Download endpoint that requires Authorization header.
 * Returns a Blob you can save as a file.
 */
export async function apiDownload(
  path: string
): Promise<{ blob: Blob; contentType: string | null }> {
  const url = joinUrl(API_URL, path);

  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(),
  });

  if (!res.ok) {
    const data = await parseJsonOrText(res);
    throw new Error(extractErrorMessage(data, res.status));
  }

  const contentType = res.headers.get("Content-Type");
  const blob = await res.blob();
  return { blob, contentType };
}
