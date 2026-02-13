import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { requireRole } from "../middleware/rbac";
import { repos } from "../persistence";

export const uploadRouter = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB MVP limit
});

// POST /uploads
uploadRouter.post(
  "/uploads",
  requireRole("ADMIN", "LECTURER", "STUDENT"),
  upload.single("file"),
  async (req, res) => {
    const kind = req.body.kind as "LECTURER_MATERIAL" | "STUDENT_SUBMISSION" | undefined;

    if (!kind || !["LECTURER_MATERIAL", "STUDENT_SUBMISSION"].includes(kind)) {
      return res.status(400).json({ error: "Invalid kind" });
    }

    // Enforce kind rules:
    // - Only LECTURER/ADMIN can upload lecturer materials
    // - Students can only upload student submissions
    if (kind === "LECTURER_MATERIAL" && !["ADMIN", "LECTURER"].includes(req.user!.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (kind === "STUDENT_SUBMISSION" && req.user!.role !== "STUDENT") {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!req.file) return res.status(400).json({ error: "Missing file" });

    const created = await repos.uploads.create({
      kind,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      storagePath: req.file.filename, // stored relative (filename only)
      uploadedBy: req.user!.id,
    });

    return res.status(201).json(created);
  }
);

// GET /uploads
uploadRouter.get(
  "/uploads",
  requireRole("ADMIN", "LECTURER", "STUDENT", "PARENT"),
  async (req, res) => {
    const list = await repos.uploads.listForUser({ id: req.user!.id, role: req.user!.role });
    return res.json(list);
  }
);

// GET /uploads/:id/download
uploadRouter.get(
  "/uploads/:id/download",
  requireRole("ADMIN", "LECTURER", "STUDENT", "PARENT"),
  async (req, res) => {
    const { id } = req.params as { id: string };

    const uploadRow = await repos.uploads.getById(id);
    if (!uploadRow) return res.status(404).json({ error: "Upload not found" });

    // permission check using same rule set as listForUser
    const role = req.user!.role;
    const userId = req.user!.id;

    const allowed =
      role === "ADMIN" ||
      role === "LECTURER" ||
      (role === "PARENT" && uploadRow.kind === "LECTURER_MATERIAL") ||
      (role === "STUDENT" &&
        (uploadRow.kind === "LECTURER_MATERIAL" ||
          (uploadRow.kind === "STUDENT_SUBMISSION" && uploadRow.uploadedBy === userId)));

    if (!allowed) return res.status(403).json({ error: "Forbidden" });

    const abs = path.join(UPLOAD_DIR, uploadRow.storagePath);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: "File missing on server" });

    res.setHeader("Content-Type", uploadRow.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${uploadRow.originalName}"`);

    return fs.createReadStream(abs).pipe(res);
  }
);
