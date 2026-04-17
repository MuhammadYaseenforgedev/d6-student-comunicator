import bcrypt from "bcryptjs";
import crypto from "crypto";
import { assignCourseToStudent, syncStudentCourseName } from "./courseAccess";
import {
  ensureGeneratedStudentNumber,
  type Queryable,
} from "./studentNumbers";

const TRUSTED_LEARNER_SOURCE = "FORGE_TALENT";

type ExistingLearnerRow = {
  id: string;
  email: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  public_student_id: string | null;
  south_african_id: string | null;
  mobile_number: string | null;
  verified_from_talent: boolean | null;
  external_source: string | null;
  external_source_id: string | null;
  locked_fields: unknown;
  source_metadata: unknown;
  active_course_id: string | null;
};

type CourseRow = {
  id: string;
  code: string;
  name: string;
};

export type ApprovedLearnerInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  nationalId?: string | null;
  courseId?: string | null;
  courseCode?: string | null;
  externalSourceId: string;
  metadata?: Record<string, unknown> | null;
};

export type ApprovedLearnerImportResult = {
  action: "created" | "updated";
  matchedBy: "created" | "externalSourceId" | "email" | "nationalId";
  userId: string;
  email: string;
  studentNumber: string;
  courseLinked: boolean;
  courseId: string | null;
  sourceMetadataStored: boolean;
  source: {
    verifiedFromTalent: boolean;
    externalSource: string;
    externalSourceId: string;
    lockedFields: string[];
  };
};

export class LearnerImportError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "LearnerImportError";
    this.status = status;
    this.code = code;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRequiredText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = normalizeRequiredText(value);
  return normalized ? normalized : null;
}

function normalizeNationalId(value: unknown): string | null {
  const normalized = String(value ?? "").replace(/\D+/g, "");
  return normalized ? normalized : null;
}

function isValidSouthAfricanId(value: string | null): boolean {
  return Boolean(value && /^\d{13}$/.test(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseLockedFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
    )
  );
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

function mergeLockedFields(existing: unknown, incoming: string[]): string[] {
  return Array.from(new Set([...parseLockedFields(existing), ...incoming]));
}

function mergeSourceMetadata(
  existing: unknown,
  incoming: Record<string, unknown> | null
): Record<string, unknown> | null {
  const existingMetadata = parseMetadata(existing);
  if (!existingMetadata && !incoming) return null;
  return {
    ...(existingMetadata ?? {}),
    ...(incoming ?? {}),
  };
}

function buildIncomingLockedFields(input: {
  phone: string | null;
  nationalId: string | null;
  courseLinked: boolean;
}): string[] {
  const fields = ["email", "firstName", "lastName"];
  if (input.phone) fields.push("phone");
  if (input.nationalId) fields.push("nationalId");
  if (input.courseLinked) fields.push("courseId");
  return fields;
}

function isTrustedImportedLearner(row: ExistingLearnerRow | null): boolean {
  return Boolean(
    row &&
      (row.verified_from_talent ||
        (String(row.external_source ?? "").trim().toUpperCase() === TRUSTED_LEARNER_SOURCE &&
          String(row.external_source_id ?? "").trim()))
  );
}

async function resolveCourse(
  db: Queryable,
  input: { courseId: string | null; courseCode: string | null }
): Promise<CourseRow | null> {
  const normalizedCourseId = normalizeOptionalText(input.courseId);
  const normalizedCourseCode = normalizeOptionalText(input.courseCode);

  if (!normalizedCourseId && !normalizedCourseCode) return null;
  if (normalizedCourseId && !isUuid(normalizedCourseId)) {
    throw new LearnerImportError(400, "VALIDATION", "courseId must be a UUID");
  }

  let byId: CourseRow | null = null;
  let byCode: CourseRow | null = null;

  if (normalizedCourseId) {
    const result = await db.query<CourseRow>(
      `
        SELECT id, code, name
        FROM courses
        WHERE id = $1
          AND is_active = true
        LIMIT 1
      `,
      [normalizedCourseId]
    );
    byId = result.rows[0] ?? null;
    if (!byId) {
      throw new LearnerImportError(404, "NOT_FOUND", "Selected course was not found");
    }
  }

  if (normalizedCourseCode) {
    const result = await db.query<CourseRow>(
      `
        SELECT id, code, name
        FROM courses
        WHERE lower(code) = lower($1)
          AND is_active = true
        LIMIT 1
      `,
      [normalizedCourseCode]
    );
    byCode = result.rows[0] ?? null;
    if (!byCode) {
      throw new LearnerImportError(404, "NOT_FOUND", "Selected course was not found");
    }
  }

  if (byId && byCode && byId.id !== byCode.id) {
    throw new LearnerImportError(400, "VALIDATION", "courseId and courseCode refer to different courses");
  }

  return byId ?? byCode;
}

async function loadLearnerBySourceId(
  db: Queryable,
  externalSourceId: string
): Promise<ExistingLearnerRow | null> {
  const result = await db.query<ExistingLearnerRow>(
    `
      SELECT
        u.id,
        u.email,
        u.role,
        u.first_name,
        u.last_name,
        u.public_student_id,
        u.south_african_id,
        sp.mobile_number,
        sp.verified_from_talent,
        sp.external_source,
        sp.external_source_id,
        sp.locked_fields,
        sp.source_metadata,
        active_course.course_id AS active_course_id
      FROM users u
      JOIN student_profiles sp ON sp.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT sc.course_id
        FROM student_courses sc
        WHERE sc.student_user_id = u.id
          AND sc.status = 'ACTIVE'
        ORDER BY sc.enrolled_at DESC
        LIMIT 1
      ) active_course ON true
      WHERE sp.external_source = $1
        AND sp.external_source_id = $2
      LIMIT 1
    `,
    [TRUSTED_LEARNER_SOURCE, externalSourceId]
  );

  return result.rows[0] ?? null;
}

async function loadLearnerByEmail(
  db: Queryable,
  email: string
): Promise<ExistingLearnerRow | null> {
  const result = await db.query<ExistingLearnerRow>(
    `
      SELECT
        u.id,
        u.email,
        u.role,
        u.first_name,
        u.last_name,
        u.public_student_id,
        u.south_african_id,
        sp.mobile_number,
        sp.verified_from_talent,
        sp.external_source,
        sp.external_source_id,
        sp.locked_fields,
        sp.source_metadata,
        active_course.course_id AS active_course_id
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT sc.course_id
        FROM student_courses sc
        WHERE sc.student_user_id = u.id
          AND sc.status = 'ACTIVE'
        ORDER BY sc.enrolled_at DESC
        LIMIT 1
      ) active_course ON true
      WHERE lower(u.email) = lower($1)
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] ?? null;
}

async function loadLearnerByNationalId(
  db: Queryable,
  nationalId: string
): Promise<ExistingLearnerRow | null> {
  const result = await db.query<ExistingLearnerRow>(
    `
      SELECT
        u.id,
        u.email,
        u.role,
        u.first_name,
        u.last_name,
        u.public_student_id,
        u.south_african_id,
        sp.mobile_number,
        sp.verified_from_talent,
        sp.external_source,
        sp.external_source_id,
        sp.locked_fields,
        sp.source_metadata,
        active_course.course_id AS active_course_id
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT sc.course_id
        FROM student_courses sc
        WHERE sc.student_user_id = u.id
          AND sc.status = 'ACTIVE'
        ORDER BY sc.enrolled_at DESC
        LIMIT 1
      ) active_course ON true
      WHERE u.south_african_id = $1
      LIMIT 1
    `,
    [nationalId]
  );

  return result.rows[0] ?? null;
}

async function resolveExistingLearner(
  db: Queryable,
  input: { email: string; nationalId: string | null; externalSourceId: string }
): Promise<{
  row: ExistingLearnerRow | null;
  matchedBy: "created" | "externalSourceId" | "email" | "nationalId";
}> {
  const [sourceMatch, emailMatch, nationalIdMatch] = await Promise.all([
    loadLearnerBySourceId(db, input.externalSourceId),
    loadLearnerByEmail(db, input.email),
    input.nationalId ? loadLearnerByNationalId(db, input.nationalId) : Promise.resolve(null),
  ]);

  const candidates = [
    { matchedBy: "externalSourceId" as const, row: sourceMatch },
    { matchedBy: "email" as const, row: emailMatch },
    { matchedBy: "nationalId" as const, row: nationalIdMatch },
  ].filter(
    (entry): entry is {
      matchedBy: "externalSourceId" | "email" | "nationalId";
      row: ExistingLearnerRow;
    } => entry.row != null
  );

  const uniqueIds = Array.from(new Set(candidates.map((entry) => entry.row.id)));
  if (uniqueIds.length > 1) {
    throw new LearnerImportError(
      409,
      "CONFLICT",
      "Approved learner matches multiple existing accounts. Resolve the duplicate learner records first."
    );
  }

  const resolved =
    candidates.find((entry) => entry.matchedBy === "externalSourceId") ??
    candidates.find((entry) => entry.matchedBy === "email") ??
    candidates.find((entry) => entry.matchedBy === "nationalId") ??
    null;

  if (!resolved) {
    return { row: null, matchedBy: "created" };
  }

  if (resolved.row.role !== "STUDENT") {
    throw new LearnerImportError(
      409,
      "CONFLICT",
      "Approved learner matched an existing non-student account. Resolve that user manually before importing."
    );
  }

  return resolved;
}

async function createImportedLearnerUser(
  db: Queryable,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    nationalId: string | null;
  }
): Promise<string> {
  const randomPassword = `Import-${crypto.randomUUID()}-${crypto.randomBytes(12).toString("hex")}`;
  const passwordHash = await bcrypt.hash(randomPassword, 10);

  const inserted = await db.query<{ id: string }>(
    `
      INSERT INTO users (
        email,
        password_hash,
        role,
        first_name,
        last_name,
        south_african_id
      )
      VALUES ($1, $2, 'STUDENT', $3, $4, $5)
      RETURNING id
    `,
    [
      input.email,
      passwordHash,
      input.firstName,
      input.lastName,
      input.nationalId,
    ]
  );

  return String(inserted.rows[0]?.id ?? "").trim();
}

export async function ingestApprovedLearner(
  db: Queryable,
  input: ApprovedLearnerInput
): Promise<ApprovedLearnerImportResult> {
  const firstName = normalizeRequiredText(input.firstName);
  const lastName = normalizeRequiredText(input.lastName);
  const email = normalizeEmail(input.email);
  const phone = normalizeOptionalText(input.phone);
  const nationalId = normalizeNationalId(input.nationalId);
  const course = await resolveCourse(db, {
    courseId: normalizeOptionalText(input.courseId),
    courseCode: normalizeOptionalText(input.courseCode),
  });
  const externalSourceId = normalizeRequiredText(input.externalSourceId);
  const metadata = input.metadata == null ? null : parseMetadata(input.metadata);

  if (!firstName) {
    throw new LearnerImportError(400, "VALIDATION", "firstName is required");
  }
  if (!lastName) {
    throw new LearnerImportError(400, "VALIDATION", "lastName is required");
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new LearnerImportError(400, "VALIDATION", "email must be a valid email address");
  }
  if (!externalSourceId) {
    throw new LearnerImportError(400, "VALIDATION", "externalSourceId is required");
  }
  if (input.metadata != null && metadata == null) {
    throw new LearnerImportError(400, "VALIDATION", "metadata must be a JSON object");
  }
  if (nationalId && !isValidSouthAfricanId(nationalId)) {
    throw new LearnerImportError(400, "VALIDATION", "nationalId must be exactly 13 digits");
  }

  const { row: existingLearner, matchedBy } = await resolveExistingLearner(db, {
    email,
    nationalId,
    externalSourceId,
  });

  const trustedExistingLearner = isTrustedImportedLearner(existingLearner);

  const userId =
    existingLearner?.id ??
    (await createImportedLearnerUser(db, {
      email,
      firstName,
      lastName,
      nationalId,
    }));

  if (existingLearner) {
    const nextFirstName = trustedExistingLearner
      ? firstName
      : normalizeRequiredText(existingLearner.first_name) || firstName;
    const nextLastName = trustedExistingLearner
      ? lastName
      : normalizeRequiredText(existingLearner.last_name) || lastName;
    const nextNationalId =
      trustedExistingLearner
        ? nationalId ?? existingLearner.south_african_id
        : normalizeOptionalText(existingLearner.south_african_id) ?? nationalId;

    await db.query(
      `
        UPDATE users
        SET
          first_name = $2,
          last_name = $3,
          south_african_id = $4
        WHERE id = $1
      `,
      [userId, nextFirstName, nextLastName, nextNationalId]
    );
  }

  const currentProfileMobile = normalizeOptionalText(existingLearner?.mobile_number);
  const nextMobileNumber = trustedExistingLearner
    ? phone ?? currentProfileMobile
    : currentProfileMobile ?? phone;

  const courseLinked = Boolean(
    course &&
      (!existingLearner?.active_course_id ||
        existingLearner.active_course_id === course.id ||
        trustedExistingLearner)
  );

  if (courseLinked && course) {
    await assignCourseToStudent(db, {
      studentId: userId,
      courseId: course.id,
      status: "ACTIVE",
      deactivateOtherCourses: true,
    });
    await syncStudentCourseName(db, userId);
  }

  const lockedFields = mergeLockedFields(
    existingLearner?.locked_fields,
    buildIncomingLockedFields({
      phone,
      nationalId,
      courseLinked,
    })
  );
  const nextSourceMetadata = mergeSourceMetadata(existingLearner?.source_metadata, metadata);

  await db.query(
    `
      INSERT INTO student_profiles (
        user_id,
        mobile_number,
        verified_from_talent,
        external_source,
        external_source_id,
        locked_fields,
        source_metadata,
        updated_at
      )
      VALUES ($1, $2, true, $3, $4, $5::jsonb, $6::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE
      SET
        mobile_number = EXCLUDED.mobile_number,
        verified_from_talent = true,
        external_source = EXCLUDED.external_source,
        external_source_id = EXCLUDED.external_source_id,
        locked_fields = EXCLUDED.locked_fields,
        source_metadata = EXCLUDED.source_metadata,
        updated_at = now()
    `,
    [
      userId,
      nextMobileNumber,
      TRUSTED_LEARNER_SOURCE,
      externalSourceId,
      JSON.stringify(lockedFields),
      nextSourceMetadata ? JSON.stringify(nextSourceMetadata) : null,
    ]
  );

  const studentNumber = await ensureGeneratedStudentNumber(db, userId);

  return {
    action: existingLearner ? "updated" : "created",
    matchedBy,
    userId,
    email: existingLearner?.email ?? email,
    studentNumber,
    courseLinked,
    courseId: courseLinked ? course?.id ?? null : null,
    sourceMetadataStored: nextSourceMetadata != null,
    source: {
      verifiedFromTalent: true,
      externalSource: TRUSTED_LEARNER_SOURCE,
      externalSourceId,
      lockedFields,
    },
  };
}
