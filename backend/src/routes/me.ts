import { Router } from "express";
import { pool } from "../config/db";

function err(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function capitalize(v: string): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function fallbackNameParts(email: string): { firstName: string; lastName: string } {
  const local = String(email ?? "")
    .split("@")[0]
    .replace(/\+.*/, "")
    .trim();
  const parts = local.split(/[._-]+/).map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0) return { firstName: "Student", lastName: "User" };
  if (parts.length === 1) return { firstName: capitalize(parts[0]), lastName: "User" };

  return {
    firstName: capitalize(parts[0]),
    lastName: parts.slice(1).map(capitalize).join(" "),
  };
}

export const meRouter = Router();

// requireAuth is already applied globally in app.ts.
meRouter.get("/me", async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await pool.query<{
      id: string;
      email: string;
      role: string;
      first_name: string | null;
      last_name: string | null;
      course_name: string | null;
      public_student_id: string | null;
    }>(
      `
        SELECT
          u.id,
          u.email,
          u.role,
          u.first_name,
          u.last_name,
          u.public_student_id,
          COALESCE(active_course.name, u.course_name) AS course_name
        FROM users u
        LEFT JOIN LATERAL (
          SELECT c.name
          FROM student_courses sc
          JOIN courses c ON c.id = sc.course_id
          WHERE sc.student_user_id = u.id
            AND sc.status = 'ACTIVE'
          ORDER BY sc.enrolled_at DESC, lower(c.name) ASC
          LIMIT 1
        ) active_course ON u.role = 'STUDENT'
        WHERE u.id = $1
        LIMIT 1
      `,
      [userId]
    );

    if ((result.rowCount ?? 0) === 0) {
      return err(res, 404, "NOT_FOUND", "User not found");
    }

    const row = result.rows[0];
    const fallback = fallbackNameParts(row.email);

    return res.json({
      id: row.id,
      email: row.email,
      role: row.role,
      firstName: row.first_name?.trim() || fallback.firstName,
      lastName: row.last_name?.trim() || fallback.lastName,
      courseName: row.course_name?.trim() || null,
      studentNumber: row.public_student_id?.trim() || null,
    });
  } catch (e) {
    console.error("[me] GET /me error", e);
    return err(res, 500, "INTERNAL", "Failed to load profile");
  }
});
