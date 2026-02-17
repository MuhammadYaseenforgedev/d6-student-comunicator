import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";
import type { UploadKind } from "../persistence/types";

export const uploadRouter = Router();

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
function canAccessUpload(user: { id: string; role: string }, u: { kind: UploadKind; uploadedBy: string }) {
  if (user.role === "ADMIN" || user.role === "LECTURER") return true;
  if (user.role === "PARENT") return u.kind === "LECTURER_MATERIAL";
  // STUDENT
  return u.kind === "LECTURER_MATERIAL" || (u.kind === "STUDENT_SUBMISSION" && u.uploadedBy === user.id);
}

/**
 * POST /api/uploads
 * multipart/form-data
 * fields:
 * - file: File
 * - kind: "LECTURER_MATERIAL" | "STUDENT_SUBMISSION"
 */
uploadRouter.post(
  "/",
  requireRole("ADMIN", "LECTURER", "STUDENT"),
  upload.single("file"),
  async (req, res) => {
    try {
      const user = req.user!;
      const kind = String(req.body?.kind ?? "") as UploadKind;

      if (kind !== "LECTURER_MATERIAL" && kind !== "STUDENT_SUBMISSION") {
        return res.status(400).json({ error: "Invalid kind. Use LECTURER_MATERIAL or STUDENT_SUBMISSION." });
      }

      // RBAC for kind (tell it like it is)
      if (kind === "LECTURER_MATERIAL" && !(user.role === "ADMIN" || user.role === "LECTURER")) {
        return res.status(403).json({ error: "Only ADMIN or LECTURER can upload lecturer material." });
      }
      if (kind === "STUDENT_SUBMISSION" && user.role !== "STUDENT") {
        return res.status(403).json({ error: "Only STUDENT can upload student submissions." });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded. Field name must be 'file'." });
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
    } catch (err) {
      console.error("[uploads] POST / error", err);
      return res.status(500).json({ error: "Upload failed" });
    }
  }
);

/**
 * GET /api/uploads
 */
uploadRouter.get("/", async (req, res) => {
  try {
    const user = req.user!;
    const items = await repos.uploads.listForUser({ id: user.id, role: user.role });
    return res.json(items);
  } catch (err) {
    console.error("[uploads] GET / error", err);
    return res.status(500).json({ error: "Failed to list uploads" });
  }
});

/**
 * GET /api/uploads/:id/download
 */
uploadRouter.get("/:id/download", async (req, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id || "").trim();

    if (!id) return res.status(400).json({ error: "Invalid upload id" });

    const u = await repos.uploads.getById(id);
    if (!u) return res.status(404).json({ error: "Not found" });

    if (!canAccessUpload(user, u)) {
      return res.status(403).json({ error: "You do not have permission to download this file." });
    }

    const absPath = path.resolve(process.cwd(), u.storagePath);

    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ error: "File missing on disk" });
    }

    res.setHeader("Content-Type", u.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(u.originalName)}"`);

    return fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    console.error("[uploads] GET /:id/download error", err);
    return res.status(500).json({ error: "Download failed" });
  }
});
