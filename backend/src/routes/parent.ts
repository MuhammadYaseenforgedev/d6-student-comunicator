import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { pgParentLinksRepo } from "../repos/pgParentLinksRepo";

export const parentRouter = Router();

// requireAuth is already applied globally in app.ts
parentRouter.use(requireRole("PARENT"));

// GET /parent/children
parentRouter.get("/children", async (req, res) => {
  const parentId = req.user!.id;

  const children = await pgParentLinksRepo.listChildren(parentId);
  return res.json({ children });
});

// POST /parent/children { studentEmail }
parentRouter.post("/children", async (req, res) => {
  const parentId = req.user!.id;
  const studentEmail = String(req.body?.studentEmail ?? "").trim();

  if (!studentEmail) {
    return res.status(400).json({ error: "studentEmail is required" });
  }

  const result = await pgParentLinksRepo.linkChildByEmail(parentId, studentEmail);

  if (!result.child) {
    return res.status(404).json({ error: "Student not found" });
  }

  return res.status(result.created ? 201 : 200).json({
    created: result.created,
    child: result.child,
  });
});

// DELETE /parent/children/:studentId
parentRouter.delete("/children/:studentId", async (req, res) => {
  const parentId = req.user!.id;
  const studentId = req.params.studentId;

  const ok = await pgParentLinksRepo.unlinkChild(parentId, studentId);

  if (!ok) {
    return res.status(404).json({ error: "Link not found" });
  }

  return res.status(204).send();
});
