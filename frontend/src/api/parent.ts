import { apiGet } from "../lib/api";

export type ParentChild = {
  id: string;
  email: string;
  role: "STUDENT";
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function listMyChildren(): Promise<ParentChild[]> {
  const data = await apiGet<unknown>("/api/parent/children");

  // Expecting { value: [...], count: n } (like your other list endpoints)
  if (Array.isArray(data)) return data as ParentChild[];

  if (isRecord(data)) {
    const value = data["value"];
    if (Array.isArray(value)) return value as ParentChild[];
  }

  return [];
}
