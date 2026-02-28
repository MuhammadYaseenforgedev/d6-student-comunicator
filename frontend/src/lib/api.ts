// frontend/src/lib/api.ts

const API_URL = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
if (import.meta.env.PROD && !API_URL) {
  throw new Error("VITE_API_URL is required for production builds.");
}

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
  // path: "/api/parent/..."
  if (!path.startsWith("/")) path = `/${path}`;
  if (!base) return path;
  return `${base}${path}`;
}

async function parseJson(res: Response): Promise<unknown> {
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

    // Backend standard: { error: { code, message } }
    const err = obj.error;
    if (err && typeof err === "object") {
      const nested = err as Record<string, unknown>;
      const code = typeof nested.code === "string" ? nested.code : "";
      const message = typeof nested.message === "string" ? nested.message : "";

      if (code && message) return `${code}: ${message}`;
      if (message) return message;
      if (code) return `${code} (${status})`;
    }

    // common fallback shapes
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
    if (typeof obj.error === "string" && obj.error.trim()) return obj.error;
  }

  if (typeof data === "string" && data.trim()) return data;

  return `Request failed (${status})`;
}

function parseDownloadFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const asciiMatch = /filename="([^"]+)"|filename=([^;]+)/i.exec(contentDisposition);
  const raw = asciiMatch?.[1] ?? asciiMatch?.[2];
  return raw ? raw.trim() : null;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const data = await parseJson(res);

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

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const url = joinUrl(API_URL, path);

  const res = await fetch(url, {
    method: "PATCH",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return parseResponse<T>(res);
}

export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const url = joinUrl(API_URL, path);

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    body: form,
  });

  return parseResponse<T>(res);
}

export async function apiDownload(
  path: string
): Promise<{ blob: Blob; fileName: string | null; contentType: string | null }> {
  const url = joinUrl(API_URL, path);

  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(),
  });

  if (!res.ok) {
    const data = await parseJson(res);
    throw new Error(extractErrorMessage(data, res.status));
  }

  const blob = await res.blob();
  const fileName = parseDownloadFilename(res.headers.get("content-disposition"));
  const contentType = res.headers.get("content-type");

  return { blob, fileName, contentType };
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
