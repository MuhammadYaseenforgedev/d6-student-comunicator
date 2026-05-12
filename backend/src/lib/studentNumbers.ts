export type Queryable = {
  query: <T>(
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

const GENERATED_STUDENT_NUMBER_PREFIX = "FA";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeStudentNumber(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function buildGeneratedStudentNumber(year: number, sequence: number): string {
  return `${GENERATED_STUDENT_NUMBER_PREFIX}-${year}${String(sequence).padStart(4, "0")}`;
}

async function getLatestGeneratedSequence(db: Queryable, year: number): Promise<number> {
  const prefix = `${GENERATED_STUDENT_NUMBER_PREFIX}-${year}`;
  const regex = `^${escapeRegExp(prefix)}([0-9]+)$`;
  const result = await db.query<{ max_sequence: number | string | null }>(
    `
      SELECT COALESCE(MAX(substring(public_student_id from $1)::int), 0) AS max_sequence
      FROM users
      WHERE public_student_id ~ $2
    `,
    [regex, regex]
  );

  return Number(result.rows[0]?.max_sequence ?? 0);
}

export async function ensureGeneratedStudentNumber(
  db: Queryable,
  userId: string,
  now = new Date()
): Promise<string> {
  const currentResult = await db.query<{ public_student_id: string | null }>(
    `
      SELECT public_student_id
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  if ((currentResult.rowCount ?? 0) === 0) {
    throw new Error("Student account was not found while generating a student number");
  }

  const currentStudentNumber = normalizeStudentNumber(currentResult.rows[0]?.public_student_id);
  if (currentStudentNumber) return currentStudentNumber;

  const year = now.getUTCFullYear();
  const baseSequence = (await getLatestGeneratedSequence(db, year)) + 1;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = buildGeneratedStudentNumber(year, baseSequence + attempt);

    try {
      const updated = await db.query<{ public_student_id: string | null }>(
        `
          UPDATE users
          SET public_student_id = $2
          WHERE id = $1
            AND (public_student_id IS NULL OR btrim(public_student_id) = '')
          RETURNING public_student_id
        `,
        [userId, candidate]
      );

      if ((updated.rowCount ?? 0) > 0) {
        return normalizeStudentNumber(updated.rows[0]?.public_student_id) || candidate;
      }

      const reloaded = await db.query<{ public_student_id: string | null }>(
        `
          SELECT public_student_id
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [userId]
      );

      const reloadedStudentNumber = normalizeStudentNumber(reloaded.rows[0]?.public_student_id);
      if (reloadedStudentNumber) return reloadedStudentNumber;
    } catch (e: any) {
      if (String(e?.code ?? "") === "23505") {
        continue;
      }
      throw e;
    }
  }

  throw new Error("Failed to generate a unique student number after multiple attempts");
}
