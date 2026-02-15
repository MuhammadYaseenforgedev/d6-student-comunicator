// src/lib/uploadStore.ts
// LocalStorage-backed upload store (frontend MVP)
// Later: this maps cleanly to a backend table + blob/object storage.

import type { UploadKind, UploadRecord, UserRole } from "./types";

// Key used in localStorage
const KEY = "d6_uploads_v1";

// -------------------------
// Helpers: load/save
// -------------------------

/**
 * Load all uploads from localStorage.
 * Always returns an array (never throws).
 */
function load(): UploadRecord[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as UploadRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save all uploads to localStorage.
 */
function save(items: UploadRecord[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

/**
 * Generate a simple unique ID for demo usage.
 * Backend will generate IDs later (UUID).
 */
function makeId() {
  return `f-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Normalize emails so matching always works.
 * This avoids bugs with casing/spaces.
 */
function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// -------------------------
// File conversion
// -------------------------

/**
 * Convert a File to a data URL (base64).
 * This is fine for demo/small files.
 * For real production: store file in object storage (S3) + DB metadata.
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

// -------------------------
// Visibility rules
// -------------------------

/**
 * Visibility rules (MVP):
 * - LECTURER/ADMIN: see ALL lecturer materials + ALL student submissions
 * - STUDENT: see ALL lecturer materials + ONLY their own submissions
 * - PARENT: see lecturer materials ONLY
 */
export function listUploadsForRole(role: UserRole, email: string): UploadRecord[] {
  const all = load();
  const e = normalizeEmail(email);

  // Sort helper: newest first
  const sortNewest = (a: UploadRecord, b: UploadRecord) =>
    new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();

  // Lecturers/Admins see everything
  if (role === "LECTURER" || role === "ADMIN") {
    return [...all].sort(sortNewest);
  }

  // Parents see lecturer materials only
  if (role === "PARENT") {
    return all.filter((u) => u.kind === "LECTURER_MATERIAL").sort(sortNewest);
  }

  // Students see lecturer materials + their own submissions only
  return all
    .filter(
      (u) =>
        u.kind === "LECTURER_MATERIAL" ||
        (u.kind === "STUDENT_SUBMISSION" && normalizeEmail(u.uploaderEmail) === e)
    )
    .sort(sortNewest);
}

// -------------------------
// Permission enforcement
// -------------------------

/**
 * Validate whether the current role can create a given upload kind.
 * Enforced here so UI hacks cannot bypass rules.
 */
function canCreate(role: UserRole, kind: UploadKind) {
  // Only lecturers/admin can upload lecturer materials
  if (kind === "LECTURER_MATERIAL") return role === "LECTURER" || role === "ADMIN";

  // Student submissions: students can submit, lecturers/admin can also submit if needed
  if (kind === "STUDENT_SUBMISSION") return role !== "PARENT";

  return false;
}

/**
 * Validate whether the current role can delete a record.
 * - ADMIN/LECTURER: delete any upload
 * - STUDENT: delete only their own STUDENT_SUBMISSION
 * - PARENT: cannot delete anything
 */
function canDelete(role: UserRole, requesterEmail: string, record: UploadRecord) {
  const req = normalizeEmail(requesterEmail);

  if (role === "ADMIN" || role === "LECTURER") return true;
  if (role === "PARENT") return false;

  // STUDENT can delete ONLY their own submission (not lecturer material)
  return (
    record.kind === "STUDENT_SUBMISSION" &&
    normalizeEmail(record.uploaderEmail) === req
  );
}

// -------------------------
// Mutations
// -------------------------

/**
 * Create an upload record.
 * NOTE: Stores base64 in localStorage. Good for demo, not for production.
 */
export async function addUpload(params: {
  file: File;
  kind: UploadKind;
  uploaderEmail: string;
  uploaderRole: UserRole;
}): Promise<UploadRecord> {
  const uploaderEmail = normalizeEmail(params.uploaderEmail);

  // ✅ Enforce permissions at store level
  if (!canCreate(params.uploaderRole, params.kind)) {
    throw new Error("You do not have permission to upload this file type.");
  }

  // Convert file to base64
  const dataUrl = await fileToDataUrl(params.file);

  // Build upload record
  const record: UploadRecord = {
    id: makeId(),
    kind: params.kind,
    fileName: params.file.name,
    mimeType: params.file.type || "application/octet-stream",
    size: params.file.size,
    dataUrl,
    uploadedAt: new Date().toISOString(),
    uploaderEmail,
    uploaderRole: params.uploaderRole,
  };

  // Save newest first
  const all = load();
  save([record, ...all]);

  return record;
}

/**
 * Delete an upload record by id.
 * We require role/email so we can enforce delete rules.
 */
export function deleteUpload(params: {
  id: string;
  requesterRole: UserRole;
  requesterEmail: string;
}) {
  const all = load();
  const record = all.find((u) => u.id === params.id);
  if (!record) return;

  // ✅ Enforce permissions at store level
  if (!canDelete(params.requesterRole, params.requesterEmail, record)) {
    throw new Error("You do not have permission to delete this file.");
  }

  save(all.filter((u) => u.id !== params.id));
}
