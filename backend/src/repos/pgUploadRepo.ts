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
    createdAt: row.created_at,
  };
}

export const pgUploadRepo: UploadRepo = {
  async create(input: CreateUploadInput): Promise<Upload> {
    // Return the created upload plus the uploader email in one round trip.
    const result = await pool.query<UploadRow>(
      `
      WITH ins AS (
        INSERT INTO uploads (kind, original_name, mime_type, size_bytes, storage_path, uploaded_by)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
      )
      SELECT
        ins.*,
        u.email AS uploaded_by_email
      FROM ins
      LEFT JOIN users u ON u.id = ins.uploaded_by
      `,
      [
        input.kind,
        input.originalName,
        input.mimeType,
        input.sizeBytes,
        input.storagePath,
        input.uploadedBy,
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
          u.email AS uploaded_by_email
        FROM uploads up
        LEFT JOIN users u ON u.id = up.uploaded_by
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
          u.email AS uploaded_by_email
        FROM uploads up
        LEFT JOIN users u ON u.id = up.uploaded_by
        WHERE up.kind = 'LECTURER_MATERIAL'
        ORDER BY up.created_at DESC
        `
      );
      return result.rows.map(mapRow);
    }

    const result = await pool.query<UploadRow>(
      `
      SELECT
        up.*,
        u.email AS uploaded_by_email
      FROM uploads up
      LEFT JOIN users u ON u.id = up.uploaded_by
      WHERE up.kind = 'LECTURER_MATERIAL'
         OR (up.kind = 'STUDENT_SUBMISSION' AND up.uploaded_by = $1)
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
        u.email AS uploaded_by_email
      FROM uploads up
      LEFT JOIN users u ON u.id = up.uploaded_by
      WHERE up.id = $1
      `,
      [id]
    );
    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  },
};
