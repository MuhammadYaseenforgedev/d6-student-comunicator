const DEFAULT_BASE = "http://localhost:3000/api";

export const API_BASE =
  (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ??
  DEFAULT_BASE;

function isJsonResponse(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  return contentType.includes("application/json");
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  // If backend returns JSON, parse it
  if (isJsonResponse(res)) {
    return (await res.json()) as T;
  }

  // Otherwise return text (typed as unknown)
  const text = await res.text();
  return text as unknown as T;
}
