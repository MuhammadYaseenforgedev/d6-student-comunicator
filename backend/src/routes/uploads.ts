import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { pool } from "../config/db";
import { requireRole } from "../middleware/rbac";
import { uploadLimiter } from "../middleware/rateLimit";
import { repos } from "../persistence";
import type { UploadKind } from "../persistence/types";

export const uploadRouter = Router();

function err(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

/**
 * Store uploads in backend/uploads by default.
 * Override with UPLOAD_DIR for cloud/container environments.
 */
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const UPLOAD_DIR = path.resolve(PROJECT_ROOT, String(process.env.UPLOAD_DIR ?? "").trim() || "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (
    _req: Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) => cb(null, UPLOAD_DIR),
  filename: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}_${safe}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// Matches your pgUploadRepo list rules
function canAccessUpload(
  user: { id: string; role: string },
  u: { kind: UploadKind; uploadedBy: string; uploadedByRole?: string | null; targetUserId?: string | null }
) {
  const uploaderRole = String(u.uploadedByRole ?? "").toUpperCase();
  const isStaffMaterial = u.kind === "LECTURER_MATERIAL" && (uploaderRole === "ADMIN" || uploaderRole === "LECTURER");

  if (user.role === "ADMIN" || user.role === "LECTURER") return true;
  if (user.role === "PARENT") return isStaffMaterial;
  // STUDENT
  return isStaffMaterial || (u.kind === "STUDENT_SUBMISSION" && (u.uploadedBy === user.id || u.targetUserId === user.id));
}

function isUploadKind(value: string): value is UploadKind {
  return value === "LECTURER_MATERIAL" || value === "STUDENT_SUBMISSION";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveUploadTarget(
  user: { id: string; role: string },
  kind: UploadKind,
  rawTargetUserId: unknown
): Promise<{ ok: true; targetUserId: string } | { ok: false; status: number; code: string; message: string }> {
  if (user.role === "STUDENT") {
    return kind === "STUDENT_SUBMISSION"
      ? { ok: true, targetUserId: user.id }
      : { ok: false, status: 400, code: "VALIDATION", message: "Invalid kind. STUDENT must use STUDENT_SUBMISSION." };
  }

  if (user.role === "LECTURER") {
    return kind === "LECTURER_MATERIAL"
      ? { ok: true, targetUserId: user.id }
      : { ok: false, status: 400, code: "VALIDATION", message: "Invalid kind. LECTURER must use LECTURER_MATERIAL." };
  }

  if (user.role !== "ADMIN") {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "Only ADMIN, LECTURER, or STUDENT can upload files." };
  }

  const targetUserId = String(rawTargetUserId ?? "").trim();
  if (!targetUserId) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION",
      message: kind === "STUDENT_SUBMISSION" ? "Select a student for this submission." : "Select a lecturer for this material.",
    };
  }

  if (!isUuid(targetUserId)) {
    return { ok: false, status: 400, code: "VALIDATION", message: "targetUserId must be a UUID" };
  }

  const target = await pool.query<{ id: string; role: string }>(
    `
      SELECT id, role
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [targetUserId]
  );

  if ((target.rowCount ?? 0) === 0) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Target user not found" };
  }

  const targetRole = String(target.rows[0]?.role ?? "").toUpperCase();
  if (kind === "STUDENT_SUBMISSION" && targetRole !== "STUDENT") {
    return { ok: false, status: 400, code: "VALIDATION", message: "Student submissions must target a student account." };
  }
  if (kind === "LECTURER_MATERIAL" && targetRole !== "LECTURER") {
    return { ok: false, status: 400, code: "VALIDATION", message: "Lecturer materials must target a lecturer account." };
  }

  return { ok: true, targetUserId };
}

/**
 * Multer errors happen before your async handler runs, so catch them explicitly.
 */
function uploadSingle(field: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.single(field)(req, res, (e: unknown) => {
      if (!e) return next();
      if (e instanceof multer.MulterError) {
        if (e.code === "LIMIT_FILE_SIZE") {
          return err(res, 413, "FILE_TOO_LARGE", "File too large (max 20MB)");
        }
        return err(res, 400, "UPLOAD_ERROR", e.message || "Upload error");
      }
      const message = e instanceof Error && e.message ? e.message : "Upload error";
      return err(res, 400, "UPLOAD_ERROR", message);
    });
  };
}

/**
 * Ensure download path stays inside UPLOAD_DIR even if DB storagePath is tampered.
 */
function resolveUploadPath(storagePath: string): string | null {
  const normalized = String(storagePath ?? "").replaceAll("\\", "/").trim();
  if (!normalized) return null;

  // Require uploads/ prefix (your DB schema style)
  if (!normalized.startsWith("uploads/")) return null;

  // Resolve relative to the active upload root.
  const relativeUploadPath = normalized.slice("uploads/".length);
  if (!relativeUploadPath) return null;
  const absPath = path.resolve(UPLOAD_DIR, relativeUploadPath);

  // Ensure absPath is within UPLOAD_DIR
  const rel = path.relative(UPLOAD_DIR, absPath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;

  return absPath;
}

function isRetryableCleanupError(code: string): boolean {
  return code === "EBUSY" || code === "EPERM";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanupUploadedFile(filePath: string | null | undefined, context: string): Promise<void> {
  if (!filePath) return;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await fs.promises.unlink(filePath);
      return;
    } catch (e: unknown) {
      const code = String((e as NodeJS.ErrnoException | undefined)?.code ?? "");
      if (code === "ENOENT") {
        return;
      }
      if (isRetryableCleanupError(code) && attempt < 2) {
        await delay(50 * (attempt + 1));
        continue;
      }
      if (isRetryableCleanupError(code)) {
        console.warn("[uploads] cleanup skipped after retries", {
          context,
          filePath,
          code,
          message: e instanceof Error ? e.message : String(e),
        });
        return;
      }
      console.error("[uploads] cleanup warning", {
        context,
        filePath,
        code,
        message: e instanceof Error ? e.message : String(e),
      });
      return;
    }
  }
}

function requestOrigin(req: Request): string {
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol)
    .split(",")[0]
    ?.trim();
  const host = String(req.get("host") ?? "").trim();
  const safeProto = proto || "http";
  return host ? `${safeProto}://${host}` : "";
}

function withDownloadUrl<T extends { id: string }>(req: Request, item: T): T & { downloadUrl: string } {
  const origin = requestOrigin(req);
  const downloadUrl = origin ? `${origin}/api/uploads/${item.id}/download` : `/api/uploads/${item.id}/download`;
  return { ...item, downloadUrl };
}

/**
 * POST /api/uploads
 * multipart/form-data
 * fields:
 * - file: File
 * - kind: "LECTURER_MATERIAL" (ADMIN/LECTURER) or "STUDENT_SUBMISSION" (STUDENT)
 */
uploadRouter.post(
  "/",
  requireRole("ADMIN", "LECTURER", "STUDENT"),
  uploadLimiter,
  uploadSingle("file"),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const kindRaw = String(req.body?.kind ?? "").trim().toUpperCase();
      if (!isUploadKind(kindRaw)) {
        await cleanupUploadedFile(req.file?.path, "POST / invalid kind");
        return err(res, 400, "VALIDATION", "kind must be LECTURER_MATERIAL or STUDENT_SUBMISSION");
      }
      const kind = kindRaw as UploadKind;

      if (user.role !== "ADMIN" && user.role !== "LECTURER" && user.role !== "STUDENT") {
        await cleanupUploadedFile(req.file?.path, "POST / invalid role");
        return err(res, 403, "FORBIDDEN", "Only ADMIN, LECTURER, or STUDENT can upload files.");
      }

      if (!req.file) {
        return err(res, 400, "VALIDATION", "No file uploaded. Field name must be 'file'.");
      }

      const target = await resolveUploadTarget(user, kind, req.body?.targetUserId);
      if (!target.ok) {
        await cleanupUploadedFile(req.file?.path, "POST / invalid target");
        return err(res, target.status, target.code, target.message);
      }

      // Store as a relative path in DB (matches your existing schema style)
      const storagePath = path.join("uploads", req.file.filename).replaceAll("\\", "/");

      const created = await repos.uploads.create({
        kind,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        storagePath,
        uploadedBy: user.id,
        targetUserId: target.targetUserId,
      });

      return res.status(201).json(withDownloadUrl(req, created));
    } catch (e: unknown) {
      console.error("[uploads] POST / error", e);
      await cleanupUploadedFile(req.file?.path, "POST / error");
      return err(res, 500, "INTERNAL", "Upload failed");
    }
  }
);

/**
 * GET /api/uploads
 */
uploadRouter.get("/", requireRole("ADMIN", "LECTURER", "STUDENT", "PARENT"), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const items = await repos.uploads.listForUser({ id: user.id, role: user.role });
    return res.json(items.map((u) => withDownloadUrl(req, u)));
  } catch (e: unknown) {
    console.error("[uploads] GET / error", e);
    return err(res, 500, "INTERNAL", "Failed to list uploads");
  }
});

/**
 * GET /api/uploads/:id/download
 */
uploadRouter.get(
  "/:id/download",
  requireRole("ADMIN", "LECTURER", "STUDENT", "PARENT"),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const id = String(req.params.id || "").trim();

      if (!id) return err(res, 400, "VALIDATION", "Invalid upload id");

      const u = await repos.uploads.getById(id);
      if (!u) return err(res, 404, "NOT_FOUND", "Not found");

      if (!canAccessUpload(user, u)) {
        return err(res, 403, "FORBIDDEN", "You do not have permission to download this file.");
      }

      const absPath = resolveUploadPath(u.storagePath);
      if (!absPath) {
        return err(res, 400, "VALIDATION", "Invalid storage path");
      }

      if (!fs.existsSync(absPath)) {
        return err(res, 404, "NOT_FOUND", "File missing on disk");
      }

      res.setHeader("Content-Type", u.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(u.originalName)}"`);

      return fs.createReadStream(absPath).pipe(res);
    } catch (e: unknown) {
      console.error("[uploads] GET /:id/download error", e);
      return err(res, 500, "INTERNAL", "Download failed");
    }
  }
);

/**
 * DELETE /api/uploads/:id
 * ADMIN/LECTURER can delete any upload metadata and best-effort remove file from disk.
 */
uploadRouter.delete("/:id", requireRole("ADMIN", "LECTURER"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return err(res, 400, "VALIDATION", "Invalid upload id");

    const existing = await repos.uploads.getById(id);
    if (!existing) return err(res, 404, "NOT_FOUND", "Not found");

    const deleted = await repos.uploads.delete(id);
    if (!deleted) return err(res, 404, "NOT_FOUND", "Not found");

    const absPath = resolveUploadPath(existing.storagePath);
    await cleanupUploadedFile(absPath, "DELETE /:id");

    return res.json({ ok: true });
  } catch (e: unknown) {
    console.error("[uploads] DELETE /:id error", e);
    return err(res, 500, "INTERNAL", "Delete failed");
  }
});
