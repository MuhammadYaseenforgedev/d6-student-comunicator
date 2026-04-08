import { pool } from "../config/db";
import type { UploadRepo, Upload, CreateUploadInput, UploadKind } from "../persistence/types";

type UploadRow = {
  id: string;
  kind: UploadKind;
  original_name: string;
  mime_type: string;
  size_bytes: number | string;
  storage_path: string;
  uploaded_by: string;
  uploaded_by_email: string | null;
  uploaded_by_role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT" | null;
  target_user_id: string | null;
  target_user_email: string | null;
  target_user_role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT" | null;
  module_id: string | null;
  module_code: string | null;
  module_name: string | null;
  course_id: string | null;
  course_code: string | null;
  course_name: string | null;
  created_at: string;
};

function mapRow(row: UploadRow): Upload {
  return {
    id: row.id,
    kind: row.kind as UploadKind,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    storagePath: row.storage_path,
    uploadedBy: row.uploaded_by,
    uploadedByEmail: row.uploaded_by_email,
    uploadedByRole: row.uploaded_by_role,
    targetUserId: row.target_user_id,
    targetUserEmail: row.target_user_email,
    targetUserRole: row.target_user_role,
    moduleId: row.module_id,
    moduleCode: row.module_code,
    moduleName: row.module_name,
    courseId: row.course_id,
    courseCode: row.course_code,
    courseName: row.course_name,
    createdAt: row.created_at,
  };
}

export const pgUploadRepo: UploadRepo = {
  async create(input: CreateUploadInput): Promise<Upload> {
    // Return the created upload plus the uploader email in one round trip.
    const result = await pool.query<UploadRow>(
      `
      WITH ins AS (
        INSERT INTO uploads (
          kind,
          original_name,
          mime_type,
          size_bytes,
          storage_path,
          uploaded_by,
          target_user_id,
          module_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
      )
      SELECT
        ins.*,
        uploader.email AS uploaded_by_email,
        uploader.role AS uploaded_by_role,
        target_user.email AS target_user_email,
        target_user.role AS target_user_role,
        fm.id AS module_id,
        fm.code AS module_code,
        fm.name AS module_name,
        c.id AS course_id,
        c.code AS course_code,
        c.name AS course_name
      FROM ins
      LEFT JOIN users uploader ON uploader.id = ins.uploaded_by
      LEFT JOIN users target_user ON target_user.id = ins.target_user_id
      LEFT JOIN faculty_modules fm ON fm.id = ins.module_id
      LEFT JOIN courses c ON c.id = fm.course_id
      `,
      [
        input.kind,
        input.originalName,
        input.mimeType,
        input.sizeBytes,
        input.storagePath,
        input.uploadedBy,
        input.targetUserId ?? null,
        input.moduleId ?? null,
      ]
    );

    return mapRow(result.rows[0]);
  },

  async listForUser(user: { id: string; role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT" }): Promise<Upload[]> {
    if (user.role === "ADMIN" || user.role === "LECTURER") {
      const result = await pool.query<UploadRow>(
        `
        SELECT
          up.*,
          uploader.email AS uploaded_by_email,
          uploader.role AS uploaded_by_role,
          target_user.email AS target_user_email,
          target_user.role AS target_user_role,
          fm.id AS module_id,
          fm.code AS module_code,
          fm.name AS module_name,
          c.id AS course_id,
          c.code AS course_code,
          c.name AS course_name
        FROM uploads up
        LEFT JOIN users uploader ON uploader.id = up.uploaded_by
        LEFT JOIN users target_user ON target_user.id = up.target_user_id
        LEFT JOIN faculty_modules fm ON fm.id = up.module_id
        LEFT JOIN courses c ON c.id = fm.course_id
        ORDER BY up.created_at DESC
        `
      );
      return result.rows.map(mapRow);
    }

    if (user.role === "PARENT") {
      const result = await pool.query<UploadRow>(
        `
        SELECT
          up.*,
          uploader.email AS uploaded_by_email,
          uploader.role AS uploaded_by_role,
          target_user.email AS target_user_email,
          target_user.role AS target_user_role,
          fm.id AS module_id,
          fm.code AS module_code,
          fm.name AS module_name,
          c.id AS course_id,
          c.code AS course_code,
          c.name AS course_name
        FROM uploads up
        JOIN users uploader ON uploader.id = up.uploaded_by
        LEFT JOIN users target_user ON target_user.id = up.target_user_id
        LEFT JOIN faculty_modules fm ON fm.id = up.module_id
        LEFT JOIN courses c ON c.id = fm.course_id
        WHERE up.kind = 'STUDENT_SUBMISSION'
          AND EXISTS (
            SELECT 1
            FROM parent_links pl
            WHERE pl.parent_user_id = $1
              AND (
                pl.student_user_id = up.uploaded_by
                OR pl.student_user_id = up.target_user_id
              )
          )
        ORDER BY up.created_at DESC
        `,
        [user.id]
      );
      return result.rows.map(mapRow);
    }

    const result = await pool.query<UploadRow>(
      `
      SELECT
        up.*,
        uploader.email AS uploaded_by_email,
        uploader.role AS uploaded_by_role,
        target_user.email AS target_user_email,
        target_user.role AS target_user_role,
        fm.id AS module_id,
        fm.code AS module_code,
        fm.name AS module_name,
        c.id AS course_id,
        c.code AS course_code,
        c.name AS course_name
      FROM uploads up
      LEFT JOIN users uploader ON uploader.id = up.uploaded_by
      LEFT JOIN users target_user ON target_user.id = up.target_user_id
      LEFT JOIN faculty_modules fm ON fm.id = up.module_id
      LEFT JOIN courses c ON c.id = fm.course_id
      WHERE (
            up.kind = 'LECTURER_MATERIAL'
        AND uploader.role IN ('ADMIN', 'LECTURER')
        AND (
              up.module_id IS NULL
           OR EXISTS (
                SELECT 1
                FROM student_module_enrollments sme
                JOIN student_courses sc
                  ON sc.student_user_id = sme.student_id
                 AND sc.course_id = fm.course_id
                 AND sc.status = 'ACTIVE'
                WHERE sme.module_id = up.module_id
                  AND sme.student_id = $1
           )
        )
      )
         OR (up.kind = 'STUDENT_SUBMISSION' AND (up.uploaded_by = $1 OR up.target_user_id = $1))
      ORDER BY up.created_at DESC
      `,
      [user.id]
    );

    return result.rows.map(mapRow);
  },

  async getById(id: string): Promise<Upload | null> {
    const result = await pool.query<UploadRow>(
      `
      SELECT
        up.*,
        uploader.email AS uploaded_by_email,
        uploader.role AS uploaded_by_role,
        target_user.email AS target_user_email,
        target_user.role AS target_user_role,
        fm.id AS module_id,
        fm.code AS module_code,
        fm.name AS module_name,
        c.id AS course_id,
        c.code AS course_code,
        c.name AS course_name
      FROM uploads up
      LEFT JOIN users uploader ON uploader.id = up.uploaded_by
      LEFT JOIN users target_user ON target_user.id = up.target_user_id
      LEFT JOIN faculty_modules fm ON fm.id = up.module_id
      LEFT JOIN courses c ON c.id = fm.course_id
      WHERE up.id = $1
      `,
      [id]
    );
    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  },

  async delete(id: string): Promise<boolean> {
    const result = await pool.query(
      `
      DELETE FROM uploads
      WHERE id = $1
      `,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },
};
