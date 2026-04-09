import { getToken } from "./auth";

type ApiEnv = {
  VITE_API_URL?: string;
  VITE_API_URL_SECONDARY?: string;
  VITE_API_TARGET?: string;
};

type ApiRequestOptions = RequestInit & {
  auth?: boolean;
};

export type ApiClientError = Error & {
  status?: number;
  raw?: unknown;
};

const env = (import.meta as unknown as { env: ApiEnv }).env;
const primaryOrigin = String(env?.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
const secondaryOrigin = String(env?.VITE_API_URL_SECONDARY ?? "").trim().replace(/\/+$/, "");
const selectedTarget = String(env?.VITE_API_TARGET ?? "primary").trim().toLowerCase();

function resolveApiOrigin(): string {
  if (selectedTarget === "secondary" && secondaryOrigin) return secondaryOrigin;
  return primaryOrigin;
}

function requireApiOrigin(): string {
  const origin = resolveApiOrigin();
  if (!origin) {
    throw new Error(
      "VITE_API_URL is missing. Set it to your backend origin (for example: https://d6-student-comunicator.onrender.com)."
    );
  }
  return origin;
}

function isJsonContentType(contentType: string | null): boolean {
  return String(contentType ?? "")
    .toLowerCase()
    .includes("application/json");
}

function pathWithSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function buildUrl(path: string): string {
  return `${requireApiOrigin()}/api${pathWithSlash(path)}`;
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const err = obj.error;
    if (err && typeof err === "object") {
      const nested = err as Record<string, unknown>;
      const message = nested.message;
      if (typeof message === "string" && message.trim()) return message;
      const code = nested.code;
      if (typeof code === "string" && code.trim()) return code;
    }

    const message = obj.message;
    if (typeof message === "string" && message.trim()) return message;
  }

  if (typeof payload === "string" && payload.trim()) return payload;
  return `Request failed (${status})`;
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const auth = options.auth !== false;
  const token = auth ? getToken() : null;
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = hasBody && options.body instanceof FormData;

  const headers = new Headers(options.headers ?? {});
  if (!isFormData && hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(buildUrl(path), {
    ...options,
    headers,
  });

  if (!res.ok) {
    const data = await readJsonSafe(res);
    const e = new Error(extractErrorMessage(data, res.status)) as ApiClientError;
    e.status = res.status;
    e.raw = data;
    throw e;
  }

  if (res.status === 204) return undefined as T;
  if (!isJsonContentType(res.headers.get("content-type"))) {
    return (await res.text()) as unknown as T;
  }

  return (await res.json()) as T;
}

export const apiClient = {
  request,
  get<T>(path: string, options?: Omit<ApiRequestOptions, "method">) {
    return request<T>(path, { ...(options ?? {}), method: "GET" });
  },
  post<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) {
    const payload =
      body instanceof FormData || body === undefined ? body : JSON.stringify(body);
    return request<T>(path, { ...(options ?? {}), method: "POST", body: payload });
  },
  put<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) {
    const payload =
      body instanceof FormData || body === undefined ? body : JSON.stringify(body);
    return request<T>(path, { ...(options ?? {}), method: "PUT", body: payload });
  },
  patch<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) {
    const payload =
      body instanceof FormData || body === undefined ? body : JSON.stringify(body);
    return request<T>(path, { ...(options ?? {}), method: "PATCH", body: payload });
  },
  delete<T>(path: string, options?: Omit<ApiRequestOptions, "method">) {
    return request<T>(path, { ...(options ?? {}), method: "DELETE" });
  },
};
