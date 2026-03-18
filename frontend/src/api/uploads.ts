// frontend/src/api/uploads.ts

import { apiDelete, apiDownload, apiGet, apiPostForm } from "../lib/api";
import type { UploadKind, UploadRecord, UserRole } from "../lib/types";
import { getUser } from "../lib/auth";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];

  if (isObject(data) && "value" in data) {
    const maybe = (data as { value: unknown }).value;
    if (Array.isArray(maybe)) return maybe as T[];
  }

  return [];
}

type BackendUpload = {
  id: string;
  kind: UploadKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedBy: string;
  uploadedByEmail?: string | null;
  uploadedByRole?: UserRole | null;
  targetUserId?: string | null;
  targetUserEmail?: string | null;
  targetUserRole?: UserRole | null;
  createdAt: string;
};

export type UploadAssignableUser = {
  id: string;
  email: string;
  role: UserRole;
};

function toUiUpload(row: BackendUpload): UploadRecord {
  const me = getUser();

  const fallbackEmail = me && row.uploadedBy === me.id ? me.email : row.uploadedBy;
  const uploaderEmail = (row.uploadedByEmail ?? "").trim() || fallbackEmail;

  return {
    id: row.id,
    kind: row.kind,
    fileName: row.originalName,
    mimeType: row.mimeType,
    size: Number(row.sizeBytes ?? 0),
    dataUrl: "", // downloads handled via downloadUpload() to include Bearer token
    uploadedAt: row.createdAt,
    uploaderEmail,
    uploaderRole: row.uploadedByRole ?? (me ? me.role : "STUDENT"),
    targetUserId: row.targetUserId ?? null,
    targetUserEmail: row.targetUserEmail ?? null,
    targetUserRole: row.targetUserRole ?? null,
  };
}

/** GET /api/uploads (may be wrapped by apiListWrapper) */
export async function listUploads(): Promise<UploadRecord[]> {
  const raw = await apiGet<unknown>("/api/uploads");
  const rows = unwrapList<BackendUpload>(raw);
  return rows.map(toUiUpload);
}

/** POST /api/uploads (multipart: file + kind) */
export async function uploadFile(input: { file: File; kind: UploadKind; targetUserId?: string }): Promise<UploadRecord> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("kind", input.kind);
  if (input.targetUserId?.trim()) {
    form.append("targetUserId", input.targetUserId.trim());
  }

  const created = await apiPostForm<BackendUpload>("/api/uploads", form);
  return toUiUpload(created);
}

export async function listUploadAssignableUsers(roles: UserRole[]): Promise<UploadAssignableUser[]> {
  const qs = new URLSearchParams();
  for (const role of roles) {
    qs.append("role", role);
  }
  qs.set("limit", "500");

  const raw = await apiGet<unknown>(`/api/users?${qs.toString()}`);
  const rows = unwrapList<UploadAssignableUser>(raw);
  return rows
    .filter((row) => row && typeof row.id === "string" && typeof row.email === "string" && typeof row.role === "string")
    .sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()));
}

/** GET /api/uploads/:id/download (Bearer token required) */
export async function downloadUpload(input: { uploadId: string; fileName: string }) {
  const { blob } = await apiDownload(`/api/uploads/${input.uploadId}/download`);

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = input.fileName || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** DELETE /api/uploads/:id */
export async function deleteUpload(input: { uploadId: string }): Promise<void> {
  await apiDelete<{ ok: boolean }>(`/api/uploads/${input.uploadId}`);
}
