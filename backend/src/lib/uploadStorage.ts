import crypto from "crypto";

const SUPABASE_STORAGE_PREFIX = "supabase://";
const SUPABASE_URL = String(process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const SUPABASE_STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET ?? "").trim() || "uploads";

export function isSupabaseUploadStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export function hasPartialSupabaseUploadStorageConfig(): boolean {
  const configured = [SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY].filter(Boolean).length;
  return configured > 0 && !isSupabaseUploadStorageConfigured();
}

export function getSupabaseUploadStorageBucket(): string {
  return SUPABASE_STORAGE_BUCKET;
}

export function buildStoredUploadFileName(originalName: string): string {
  const safe = String(originalName ?? "").replace(/[^a-zA-Z0-9._-]/g, "_") || "upload.bin";
  return `${Date.now()}_${crypto.randomBytes(8).toString("hex")}_${safe}`;
}

export function buildSupabaseUploadStoragePath(fileName: string): string {
  const objectPath = `uploads/${fileName}`.replace(/^\/+/, "");
  return `${SUPABASE_STORAGE_PREFIX}${SUPABASE_STORAGE_BUCKET}/${objectPath}`;
}

export function isSupabaseUploadStoragePath(storagePath: string): boolean {
  return String(storagePath ?? "").trim().toLowerCase().startsWith(SUPABASE_STORAGE_PREFIX);
}

function parseSupabaseUploadStoragePath(storagePath: string): { bucket: string; objectPath: string } | null {
  const normalized = String(storagePath ?? "").trim();
  if (!isSupabaseUploadStoragePath(normalized)) return null;

  const remainder = normalized.slice(SUPABASE_STORAGE_PREFIX.length);
  const slash = remainder.indexOf("/");
  if (slash <= 0) return null;

  const bucket = remainder.slice(0, slash).trim();
  const objectPath = remainder.slice(slash + 1).trim().replace(/^\/+/, "");
  if (!bucket || !objectPath) return null;

  return { bucket, objectPath };
}

function encodeStoragePathSegment(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function readStorageError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as Record<string, unknown>;
    const message = String(data.message ?? data.error ?? "").trim();
    if (message) return message;
  } catch {
    // Fall back to plain text below.
  }

  try {
    const text = (await res.text()).trim();
    if (text) return text;
  } catch {
    // Ignore read failures.
  }

  return `Storage request failed (${res.status})`;
}

function storageHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    ...(extra ?? {}),
  };
}

export async function uploadBufferToSupabaseStorage(input: {
  storagePath: string;
  file: Buffer;
  contentType: string;
}): Promise<void> {
  const parsed = parseSupabaseUploadStoragePath(input.storagePath);
  if (!parsed) {
    throw new Error(`Invalid Supabase storage path: ${input.storagePath}`);
  }
  if (!isSupabaseUploadStorageConfigured()) {
    throw new Error("Supabase upload storage is not configured");
  }

  const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(parsed.bucket)}/${encodeStoragePathSegment(parsed.objectPath)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: storageHeaders({
      "Content-Type": input.contentType || "application/octet-stream",
      "x-upsert": "false",
    }),
    body: new Uint8Array(input.file),
  });

  if (!res.ok) {
    throw new Error(await readStorageError(res));
  }
}

export async function downloadFromSupabaseStorage(storagePath: string): Promise<{
  buffer: Buffer;
  contentType: string | null;
} | null> {
  const parsed = parseSupabaseUploadStoragePath(storagePath);
  if (!parsed) {
    throw new Error(`Invalid Supabase storage path: ${storagePath}`);
  }
  if (!isSupabaseUploadStorageConfigured()) {
    throw new Error("Supabase upload storage is not configured");
  }

  const url = `${SUPABASE_URL}/storage/v1/object/authenticated/${encodeURIComponent(parsed.bucket)}/${encodeStoragePathSegment(parsed.objectPath)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: storageHeaders(),
  });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(await readStorageError(res));
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    buffer,
    contentType: res.headers.get("content-type"),
  };
}

export async function deleteFromSupabaseStorage(storagePath: string): Promise<void> {
  const parsed = parseSupabaseUploadStoragePath(storagePath);
  if (!parsed) {
    throw new Error(`Invalid Supabase storage path: ${storagePath}`);
  }
  if (!isSupabaseUploadStorageConfigured()) {
    return;
  }

  const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(parsed.bucket)}/${encodeStoragePathSegment(parsed.objectPath)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: storageHeaders(),
  });

  if (res.status === 404) return;
  if (!res.ok) {
    throw new Error(await readStorageError(res));
  }
}
