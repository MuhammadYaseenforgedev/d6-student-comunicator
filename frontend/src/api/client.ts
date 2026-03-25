const env = (import.meta as { env?: { VITE_API_URL?: string } }).env;
const apiOrigin = (env?.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
export const API_CONFIG_ERROR = !apiOrigin
  ? "VITE_API_URL is missing. Set it to your backend origin (for example: https://d6-student-comunicator.onrender.com)."
  : null;

export const API_BASE = API_CONFIG_ERROR ? "" : `${apiOrigin}/api`;

function requireApiBase(): string {
  if (API_CONFIG_ERROR) throw new Error(API_CONFIG_ERROR);
  return API_BASE;
}

function isJsonResponse(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  return contentType.includes("application/json");
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${requireApiBase()}${path}`, {
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
