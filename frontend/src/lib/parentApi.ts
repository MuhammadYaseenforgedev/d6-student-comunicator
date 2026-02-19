const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

function authHeaders() {
  const token = localStorage.getItem("token"); // change key if yours differs
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function httpGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Request failed (${res.status})`);
  }

  return res.json();
}

export const parentApi = {
  portal: () => httpGet<{ ok: boolean; role: string; message: string }>(`/api/parent/parent`),

  linkRequests: () =>
    httpGet<Array<{ id: string; childId: string; status: string; requestedAt: string }>>(
      `/api/parent/parent/link-requests`
    ),

  results: (childId: string) =>
    httpGet<Array<{ id: string; subject: string; score: number; outOf: number; date: string }>>(
      `/api/parent/parent/results?childId=${encodeURIComponent(childId)}`
    ),

  finance: (childId: string) =>
    httpGet<{
      balance: number;
      statements: number;
      lastPayment: string | null;
      status: string;
      documents: Array<{
        id: string;
        kind: string;
        type: string;
        amount: number;
        occurredAt: string;
        description: string | null;
      }>;
      notifications: Array<{ id: string; title: string; body: string; severity: string }>;
    }>(`/api/parent/parent/finance?childId=${encodeURIComponent(childId)}`),
};
