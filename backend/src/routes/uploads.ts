import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";
import type { UploadKind } from "../persistence/types";

export const uploadRouter = Router();

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

/**
 * Store uploads in backend/uploads (relative to backend working directory).
 * Your DB stores storagePath, and we resolve it from process.cwd().
 */
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
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
  u: { kind: UploadKind; uploadedBy: string; uploadedByRole?: string | null }
) {
  const uploaderRole = String(u.uploadedByRole ?? "").toUpperCase();
  const isStaffMaterial = u.kind === "LECTURER_MATERIAL" && (uploaderRole === "ADMIN" || uploaderRole === "LECTURER");

  if (user.role === "ADMIN" || user.role === "LECTURER") return true;
  if (user.role === "PARENT") return isStaffMaterial;
  // STUDENT
  return isStaffMaterial || (u.kind === "STUDENT_SUBMISSION" && u.uploadedBy === user.id);
}

/**
 * Multer errors happen before your async handler runs, so catch them explicitly.
 */
function uploadSingle(field: string) {
  return (req: any, res: any, next: any) => {
    upload.single(field)(req, res, (e: any) => {
      if (!e) return next();
      if (e instanceof multer.MulterError) {
        if (e.code === "LIMIT_FILE_SIZE") {
          return err(res, 413, "FILE_TOO_LARGE", "File too large (max 20MB)");
        }
        return err(res, 400, "UPLOAD_ERROR", e.message || "Upload error");
      }
      return err(res, 400, "UPLOAD_ERROR", e?.message ?? "Upload error");
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

  // Resolve from project root
  const absPath = path.resolve(process.cwd(), normalized);

  // Ensure absPath is within UPLOAD_DIR
  const rel = path.relative(UPLOAD_DIR, absPath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;

  return absPath;
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
  uploadSingle("file"),
  async (req, res) => {
    try {
      const user = req.user!;
      const kind = String(req.body?.kind ?? "") as UploadKind;

      if (user.role === "ADMIN" || user.role === "LECTURER") {
        if (kind !== "LECTURER_MATERIAL") {
          return err(res, 400, "VALIDATION", "Invalid kind. ADMIN/LECTURER must use LECTURER_MATERIAL.");
        }
      } else if (user.role === "STUDENT") {
        if (kind !== "STUDENT_SUBMISSION") {
          return err(res, 400, "VALIDATION", "Invalid kind. STUDENT must use STUDENT_SUBMISSION.");
        }
      } else {
        return err(res, 403, "FORBIDDEN", "Only ADMIN, LECTURER, or STUDENT can upload files.");
      }

      if (!req.file) {
        return err(res, 400, "VALIDATION", "No file uploaded. Field name must be 'file'.");
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
      });

      return res.status(201).json(created);
    } catch (e: any) {
      console.error("[uploads] POST / error", e);
      return err(res, 500, "INTERNAL", "Upload failed");
    }
  }
);

/**
 * GET /api/uploads
 */
uploadRouter.get("/", requireRole("ADMIN", "LECTURER", "STUDENT", "PARENT"), async (req, res) => {
  try {
    const user = req.user!;
    const items = await repos.uploads.listForUser({ id: user.id, role: user.role });
    return res.json(items);
  } catch (e: any) {
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
  async (req, res) => {
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
    } catch (e: any) {
      console.error("[uploads] GET /:id/download error", e);
      return err(res, 500, "INTERNAL", "Download failed");
    }
  }
);

/**
 * DELETE /api/uploads/:id
 * ADMIN/LECTURER can delete any upload metadata and best-effort remove file from disk.
 */
uploadRouter.delete("/:id", requireRole("ADMIN", "LECTURER"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return err(res, 400, "VALIDATION", "Invalid upload id");

    const existing = await repos.uploads.getById(id);
    if (!existing) return err(res, 404, "NOT_FOUND", "Not found");

    const deleted = await repos.uploads.delete(id);
    if (!deleted) return err(res, 404, "NOT_FOUND", "Not found");

    const absPath = resolveUploadPath(existing.storagePath);
    if (absPath && fs.existsSync(absPath)) {
      try {
        fs.unlinkSync(absPath);
      } catch (e: any) {
        console.error("[uploads] DELETE /:id unlink warning", e);
      }
    }

    return res.json({ ok: true });
  } catch (e: any) {
    console.error("[uploads] DELETE /:id error", e);
    return err(res, 500, "INTERNAL", "Delete failed");
  }
});
