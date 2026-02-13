import { pool } from "../config/db";
import type {
  UploadRepo,
  Upload,
  CreateUploadInput,
  UploadKind,
} from "../persistence/types";

type UploadRow = {
  id: string;
  kind: UploadKind;
  original_name: string;
  mime_type: string;
  size_bytes: number | string;
  storage_path: string;
  uploaded_by: string;
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
    createdAt: row.created_at,
  };
}

export const pgUploadRepo: UploadRepo = {
  async create(input: CreateUploadInput): Promise<Upload> {
    const result = await pool.query<UploadRow>(
      `
      INSERT INTO uploads (kind, original_name, mime_type, size_bytes, storage_path, uploaded_by)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
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

  async listForUser(user: {
    id: string;
    role: "ADMIN" | "LECTURER" | "STUDENT" | "PARENT";
  }): Promise<Upload[]> {
    // ADMIN / LECTURER: everything
    if (user.role === "ADMIN" || user.role === "LECTURER") {
      const result = await pool.query<UploadRow>(
        `SELECT * FROM uploads ORDER BY created_at DESC`
      );
      return result.rows.map(mapRow);
    }

    // PARENT: lecturer materials only
    if (user.role === "PARENT") {
      const result = await pool.query<UploadRow>(
        `SELECT * FROM uploads WHERE kind = 'LECTURER_MATERIAL' ORDER BY created_at DESC`
      );
      return result.rows.map(mapRow);
    }

    // STUDENT: lecturer materials + own submissions
    const result = await pool.query<UploadRow>(
      `
      SELECT * FROM uploads
      WHERE kind = 'LECTURER_MATERIAL'
         OR (kind = 'STUDENT_SUBMISSION' AND uploaded_by = $1)
      ORDER BY created_at DESC
      `,
      [user.id]
    );

    return result.rows.map(mapRow);
  },

  async getById(id: string): Promise<Upload | null> {
    const result = await pool.query<UploadRow>(
      `SELECT * FROM uploads WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  },
};
