import { Router, type NextFunction, type Request, type Response } from "express";
import type { PoolClient } from "pg";
import multer from "multer";
import { pool } from "../config/db";
import {
  assignCourseToStudent,
  isLecturerAllowedForStudent,
  isLecturerAssignedToCourse,
  syncStudentCourseName,
} from "../lib/courseAccess";
import {
  ingestApprovedLearner,
  LearnerImportError,
} from "../lib/learnerImports";
import {
  issueLearnerActivation,
  LearnerActivationError,
  type LearnerOnboardingStatus,
} from "../lib/learnerActivation";
import {
  CsvImportError,
  importApprovedLearnersFromCsv,
} from "../lib/learnerCsvImport";
import { requireAccess, requireRole } from "../middleware/rbac";

type StudentProfileRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  surname: string | null;
  student_number: string | null;
  id_number: string | null;
  date_of_birth: string | null;
  mobile_number: string | null;
  alternative_contact_number: string | null;
  street_address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  fee_status: string | null;
  payment_method: string | null;
  amount_due_cents: number | null;
  amount_paid_cents: number | null;
  last_payment_date: string | null;
  payment_reference: string | null;
  completed_at: string | null;
  updated_at: string | null;
  course_id: string | null;
  course_code: string | null;
  course_name: string | null;
};

type StudentListRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  surname: string | null;
  student_number: string | null;
  id_number: string | null;
  course_id: string | null;
  course_code: string | null;
  course_name: string | null;
  completed_at: string | null;
};

type ImportedLearnerListRow = {
  total_count: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  public_student_id: string | null;
  course_id: string | null;
  course_code: string | null;
  course_name: string | null;
  external_source: string | null;
  external_source_id: string | null;
  activation_required: boolean | null;
  onboarding_status: LearnerOnboardingStatus | null;
  activation_invited_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string | null;
  has_active_activation_token: boolean;
};

type CourseOptionRow = {
  id: string;
  code: string;
  name: string;
};

type StudentProfileDetail = {
  userId: string;
  email: string;
  fullName: string;
  surname: string;
  studentNumber: string;
  idNumber: string;
  dateOfBirth: string | null;
  mobileNumber: string;
  alternativeContactNumber: string | null;
  streetAddress: string;
  city: string;
  province: string;
  postalCode: string;
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
  feeStatus: "PAID" | "PARTIAL" | "OUTSTANDING" | "";
  paymentMethod: string;
  amountDue: number | null;
  amountPaid: number | null;
  lastPaymentDate: string | null;
  paymentReference: string | null;
  courseId: string | null;
  courseCode: string | null;
  courseName: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  isComplete: boolean;
  missingFields: string[];
};

function err(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function learnerActivationIssueStatus(
  error: LearnerActivationError
): "already_activated" | "not_eligible" | null {
  const message = error.message.toLowerCase();
  if (message.includes("already activated")) return "already_activated";
  if (message.includes("only be issued")) return "not_eligible";
  return null;
}

const csvImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
});

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function hasOwn(input: unknown, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input ?? {}, key);
}

function toTrimmedString(value: unknown): string {
  return String(value ?? "").trim();
}

function toNullableTrimmedString(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  return normalized ? normalized : null;
}

function normalizeStudentNumber(value: unknown): string | null {
  const normalized = toTrimmedString(value).toUpperCase();
  return normalized ? normalized : null;
}

function normalizeSouthAfricanId(value: unknown): string | null {
  const normalized = String(value ?? "").replace(/\D+/g, "");
  return normalized ? normalized : null;
}

function isValidSouthAfricanId(value: string | null): boolean {
  return Boolean(value && /^\d{13}$/.test(value));
}

function parseDateOnly(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  if (!normalized) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function parseLimit(raw: unknown, fallback = 50, max = 100) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function parseOffset(raw: unknown, fallback = 0, max = 10000) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function singleQueryValue(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return toTrimmedString(value);
}

function parseOptionalBoolean(raw: unknown): boolean | null | undefined {
  const normalized = singleQueryValue(raw).toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return undefined;
}

const ONBOARDING_STATUS_FILTERS: LearnerOnboardingStatus[] = [
  "PENDING_ACTIVATION",
  "INVITED",
  "ACTIVATED",
];

function parseOnboardingStatus(raw: unknown): LearnerOnboardingStatus | null | undefined {
  const normalized = singleQueryValue(raw).toUpperCase();
  if (!normalized || normalized === "ALL") return null;
  if (ONBOARDING_STATUS_FILTERS.includes(normalized as LearnerOnboardingStatus)) {
    return normalized as LearnerOnboardingStatus;
  }
  return undefined;
}

function normalizeFeeStatus(raw: unknown): "PAID" | "PARTIAL" | "OUTSTANDING" | null {
  const normalized = toTrimmedString(raw).toUpperCase();
  if (normalized === "PAID" || normalized === "PARTIAL" || normalized === "OUTSTANDING") {
    return normalized;
  }
  return null;
}

function isSupportedCsvUpload(file: Express.Multer.File): boolean {
  const fileName = String(file.originalname ?? "").trim().toLowerCase();
  const mimeType = String(file.mimetype ?? "").trim().toLowerCase();
  return (
    fileName.endsWith(".csv") ||
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "text/plain"
  );
}

function csvImportUploadMiddleware(req: Request, res: Response, next: NextFunction) {
  csvImportUpload.single("file")(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      return err(res, 400, "UPLOAD", error.message);
    }
    return err(res, 400, "UPLOAD", "Invalid CSV upload");
  });
}

function amountFromCents(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value / 100;
}

function buildMissingFields(profile: {
  email: string;
  fullName: string;
  surname: string;
  studentNumber: string;
  idNumber: string;
  mobileNumber: string;
  streetAddress: string;
  city: string;
  province: string;
  postalCode: string;
  courseId: string | null;
}): string[] {
  const missing: string[] = [];

  if (!profile.email.trim()) missing.push("email");
  if (!profile.fullName.trim()) missing.push("fullName");
  if (!profile.surname.trim()) missing.push("surname");
  if (!profile.studentNumber.trim()) missing.push("studentNumber");
  if (!isValidSouthAfricanId(profile.idNumber)) missing.push("idNumber");
  if (!profile.mobileNumber.trim()) missing.push("mobileNumber");
  if (!profile.streetAddress.trim()) missing.push("streetAddress");
  if (!profile.city.trim()) missing.push("city");
  if (!profile.province.trim()) missing.push("province");
  if (!profile.postalCode.trim()) missing.push("postalCode");
  if (!profile.courseId) missing.push("courseId");

  return missing;
}

function mapStudentProfile(row: StudentProfileRow | null): StudentProfileDetail | null {
  if (!row) return null;

  const feeStatus: StudentProfileDetail["feeStatus"] =
    normalizeFeeStatus(row.fee_status) ?? "";

  const profile = {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name?.trim() ?? "",
    surname: row.surname?.trim() ?? "",
    studentNumber: row.student_number?.trim() ?? "",
    idNumber: row.id_number?.trim() ?? "",
    dateOfBirth: row.date_of_birth,
    mobileNumber: row.mobile_number?.trim() ?? "",
    alternativeContactNumber: row.alternative_contact_number?.trim() ?? null,
    streetAddress: row.street_address?.trim() ?? "",
    city: row.city?.trim() ?? "",
    province: row.province?.trim() ?? "",
    postalCode: row.postal_code?.trim() ?? "",
    emergencyContactName: row.emergency_contact_name?.trim() ?? null,
    emergencyContactNumber: row.emergency_contact_number?.trim() ?? null,
    feeStatus,
    paymentMethod: row.payment_method?.trim() ?? "",
    amountDue: amountFromCents(row.amount_due_cents),
    amountPaid: amountFromCents(row.amount_paid_cents),
    lastPaymentDate: row.last_payment_date,
    paymentReference: row.payment_reference?.trim() ?? null,
    courseId: row.course_id,
    courseCode: row.course_code,
    courseName: row.course_name,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };

  const missingFields = buildMissingFields(profile);
  return {
    ...profile,
    isComplete: missingFields.length === 0,
    missingFields,
  };
}

function redactStudentFinance(profile: StudentProfileDetail | null): StudentProfileDetail | null {
  if (!profile) return null;
  return {
    ...profile,
    feeStatus: "",
    paymentMethod: "",
    amountDue: null,
    amountPaid: null,
    lastPaymentDate: null,
    paymentReference: null,
  };
}

function mapImportedLearner(row: ImportedLearnerListRow) {
  const firstName = row.first_name?.trim() ?? "";
  const lastName = row.last_name?.trim() ?? "";
  const learnerName = [firstName, lastName].filter(Boolean).join(" ").trim() || row.email;
  const isActivated = Boolean(row.activated_at || row.onboarding_status === "ACTIVATED");

  return {
    userId: row.user_id,
    email: row.email,
    firstName,
    lastName,
    learnerName,
    studentNumber: row.public_student_id?.trim() ?? null,
    courseId: row.course_id,
    courseCode: row.course_code,
    courseName: row.course_name,
    externalSource: row.external_source?.trim() ?? null,
    externalSourceId: row.external_source_id?.trim() ?? null,
    activationRequired: Boolean(row.activation_required),
    onboardingStatus: row.onboarding_status,
    activationInvitedAt: row.activation_invited_at,
    activatedAt: row.activated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasActiveActivationToken: Boolean(row.has_active_activation_token),
    canReissueActivation: !isActivated,
  };
}

async function listAvailableCourses(
  db: Pick<PoolClient, "query"> | typeof pool
): Promise<Array<{ id: string; code: string; name: string }>> {
  const result = await db.query<CourseOptionRow>(
    `
      SELECT id, code, name
      FROM courses
      WHERE is_active = true
      ORDER BY lower(name) ASC, code ASC
    `
  );

  return result.rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
  }));
}

async function loadStudentProfile(
  db: Pick<PoolClient, "query"> | typeof pool,
  userId: string
): Promise<StudentProfileDetail | null> {
  const result = await db.query<StudentProfileRow>(
    `
      SELECT
        u.id AS user_id,
        u.email,
        u.first_name AS full_name,
        u.last_name AS surname,
        u.public_student_id AS student_number,
        u.south_african_id AS id_number,
        sp.date_of_birth,
        sp.mobile_number,
        sp.alternative_contact_number,
        sp.street_address,
        sp.city,
        sp.province,
        sp.postal_code,
        sp.emergency_contact_name,
        sp.emergency_contact_number,
        sp.fee_status,
        sp.payment_method,
        sp.amount_due_cents,
        sp.amount_paid_cents,
        sp.last_payment_date,
        sp.payment_reference,
        sp.completed_at,
        sp.updated_at,
        active_course.id AS course_id,
        active_course.code AS course_code,
        active_course.name AS course_name
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT c.id, c.code, c.name
        FROM student_courses sc
        JOIN courses c ON c.id = sc.course_id
        WHERE sc.student_user_id = u.id
          AND sc.status = 'ACTIVE'
        ORDER BY sc.enrolled_at DESC, lower(c.name) ASC
        LIMIT 1
      ) active_course ON true
      WHERE u.id = $1
        AND u.role = 'STUDENT'
      LIMIT 1
    `,
    [userId]
  );

  return mapStudentProfile(result.rows[0] ?? null);
}

async function ensureStudentExists(userId: string): Promise<boolean> {
  const result = await pool.query(
    `
      SELECT 1
      FROM users
      WHERE id = $1
        AND role = 'STUDENT'
      LIMIT 1
    `,
    [userId]
  );

  return (result.rowCount ?? 0) > 0;
}

async function ensureViewerCanAccessStudent(viewer: {
  id: string;
  role: string;
  adminScope?: string | null;
}, studentId: string): Promise<boolean> {
  if (viewer.role === "ADMIN") {
    return viewer.adminScope === "ACADEMIC" || viewer.adminScope === "SUPER" || viewer.adminScope == null;
  }
  if (viewer.role === "LECTURER") {
    return isLecturerAllowedForStudent(pool, viewer.id, studentId);
  }
  return false;
}

export const studentRouter = Router();

studentRouter.get(
  "/student/profile",
  requireRole("STUDENT"),
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const [profile, availableCourses] = await Promise.all([
        loadStudentProfile(pool, userId),
        listAvailableCourses(pool),
      ]);

      if (!profile) {
        return err(res, 404, "NOT_FOUND", "Student profile could not be loaded");
      }

      return res.json({
        profile: redactStudentFinance(profile),
        availableCourses,
      });
    } catch (e) {
      console.error("[students] GET /student/profile error", e);
      return err(res, 500, "INTERNAL", "Failed to load student profile");
    }
  }
);

studentRouter.put(
  "/student/profile",
  requireRole("STUDENT"),
  async (req, res) => {
    const userId = req.user!.id;
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      const current = await loadStudentProfile(client, userId);
      if (!current) {
        return err(res, 404, "NOT_FOUND", "Student profile could not be loaded");
      }

      const nextProfile = {
        fullName: hasOwn(req.body, "fullName")
          ? toTrimmedString(req.body?.fullName)
          : current.fullName,
        surname: hasOwn(req.body, "surname")
          ? toTrimmedString(req.body?.surname)
          : current.surname,
        studentNumber: hasOwn(req.body, "studentNumber")
          ? normalizeStudentNumber(req.body?.studentNumber) ?? ""
          : current.studentNumber,
        idNumber: hasOwn(req.body, "idNumber")
          ? normalizeSouthAfricanId(req.body?.idNumber) ?? ""
          : current.idNumber,
        dateOfBirth: hasOwn(req.body, "dateOfBirth")
          ? parseDateOnly(req.body?.dateOfBirth)
          : current.dateOfBirth,
        mobileNumber: hasOwn(req.body, "mobileNumber")
          ? toTrimmedString(req.body?.mobileNumber)
          : current.mobileNumber,
        alternativeContactNumber: hasOwn(req.body, "alternativeContactNumber")
          ? toNullableTrimmedString(req.body?.alternativeContactNumber)
          : current.alternativeContactNumber,
        streetAddress: hasOwn(req.body, "streetAddress")
          ? toTrimmedString(req.body?.streetAddress)
          : current.streetAddress,
        city: hasOwn(req.body, "city") ? toTrimmedString(req.body?.city) : current.city,
        province: hasOwn(req.body, "province")
          ? toTrimmedString(req.body?.province)
          : current.province,
        postalCode: hasOwn(req.body, "postalCode")
          ? toTrimmedString(req.body?.postalCode)
          : current.postalCode,
        emergencyContactName: hasOwn(req.body, "emergencyContactName")
          ? toNullableTrimmedString(req.body?.emergencyContactName)
          : current.emergencyContactName,
        emergencyContactNumber: hasOwn(req.body, "emergencyContactNumber")
          ? toNullableTrimmedString(req.body?.emergencyContactNumber)
          : current.emergencyContactNumber,
        courseId: hasOwn(req.body, "courseId")
          ? toNullableTrimmedString(req.body?.courseId)
          : current.courseId,
        feeStatus: current.feeStatus,
        paymentMethod: current.paymentMethod,
        amountDueCents: current.amountDue == null
          ? null
          : Math.round(current.amountDue * 100),
        amountPaidCents: current.amountPaid == null
          ? null
          : Math.round(current.amountPaid * 100),
        lastPaymentDate: current.lastPaymentDate,
        paymentReference: current.paymentReference,
      };

      if (hasOwn(req.body, "studentNumber") && nextProfile.studentNumber.length > 64) {
        return err(res, 400, "VALIDATION", "studentNumber must be 64 characters or fewer");
      }

      if (hasOwn(req.body, "idNumber") && nextProfile.idNumber && !isValidSouthAfricanId(nextProfile.idNumber)) {
        return err(res, 400, "VALIDATION", "idNumber must be exactly 13 digits");
      }

      if (hasOwn(req.body, "dateOfBirth") && req.body?.dateOfBirth && !nextProfile.dateOfBirth) {
        return err(res, 400, "VALIDATION", "dateOfBirth must be YYYY-MM-DD");
      }

      if (nextProfile.courseId && !isUuid(nextProfile.courseId)) {
        return err(res, 400, "VALIDATION", "courseId must be a UUID");
      }

      if (nextProfile.courseId) {
        const courseResult = await client.query(
          `
            SELECT 1
            FROM courses
            WHERE id = $1
              AND is_active = true
            LIMIT 1
          `,
          [nextProfile.courseId]
        );
        if ((courseResult.rowCount ?? 0) === 0) {
          return err(res, 404, "NOT_FOUND", "Selected course was not found");
        }
      }

      const missingFields = buildMissingFields({
        email: current.email,
        fullName: nextProfile.fullName,
        surname: nextProfile.surname,
        studentNumber: nextProfile.studentNumber,
        idNumber: nextProfile.idNumber,
        mobileNumber: nextProfile.mobileNumber,
        streetAddress: nextProfile.streetAddress,
        city: nextProfile.city,
        province: nextProfile.province,
        postalCode: nextProfile.postalCode,
        courseId: nextProfile.courseId,
      });

      await client.query("BEGIN");
      transactionOpen = true;

      await client.query(
        `
          UPDATE users
          SET
            first_name = $2,
            last_name = $3,
            public_student_id = $4,
            south_african_id = $5
          WHERE id = $1
            AND role = 'STUDENT'
        `,
        [
          userId,
          nextProfile.fullName || null,
          nextProfile.surname || null,
          nextProfile.studentNumber || null,
          nextProfile.idNumber || null,
        ]
      );

      await client.query(
        `
          INSERT INTO student_profiles (
            user_id,
            date_of_birth,
            mobile_number,
            alternative_contact_number,
            street_address,
            city,
            province,
            postal_code,
            emergency_contact_name,
            emergency_contact_number,
            fee_status,
            payment_method,
            amount_due_cents,
            amount_paid_cents,
            last_payment_date,
            payment_reference,
            completed_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16,
            CASE WHEN $17::boolean THEN now() ELSE NULL END,
            now()
          )
          ON CONFLICT (user_id) DO UPDATE
          SET
            date_of_birth = EXCLUDED.date_of_birth,
            mobile_number = EXCLUDED.mobile_number,
            alternative_contact_number = EXCLUDED.alternative_contact_number,
            street_address = EXCLUDED.street_address,
            city = EXCLUDED.city,
            province = EXCLUDED.province,
            postal_code = EXCLUDED.postal_code,
            emergency_contact_name = EXCLUDED.emergency_contact_name,
            emergency_contact_number = EXCLUDED.emergency_contact_number,
            fee_status = EXCLUDED.fee_status,
            payment_method = EXCLUDED.payment_method,
            amount_due_cents = EXCLUDED.amount_due_cents,
            amount_paid_cents = EXCLUDED.amount_paid_cents,
            last_payment_date = EXCLUDED.last_payment_date,
            payment_reference = EXCLUDED.payment_reference,
            completed_at = CASE
              WHEN $17::boolean THEN now()
              ELSE NULL
            END,
            updated_at = now()
        `,
        [
          userId,
          nextProfile.dateOfBirth,
          nextProfile.mobileNumber || null,
          nextProfile.alternativeContactNumber,
          nextProfile.streetAddress || null,
          nextProfile.city || null,
          nextProfile.province || null,
          nextProfile.postalCode || null,
          nextProfile.emergencyContactName,
          nextProfile.emergencyContactNumber,
          nextProfile.feeStatus || null,
          nextProfile.paymentMethod || null,
          nextProfile.amountDueCents,
          nextProfile.amountPaidCents,
          nextProfile.lastPaymentDate,
          nextProfile.paymentReference,
          missingFields.length === 0,
        ]
      );

      if (hasOwn(req.body, "courseId")) {
        if (nextProfile.courseId) {
          await assignCourseToStudent(client, {
            studentId: userId,
            courseId: nextProfile.courseId,
            status: "ACTIVE",
            deactivateOtherCourses: true,
          });
        } else {
          await client.query(
            `
              UPDATE student_courses
              SET status = 'INACTIVE'
              WHERE student_user_id = $1
            `,
            [userId]
          );
        }
      }

      await syncStudentCourseName(client, userId);
      await client.query("COMMIT");
      transactionOpen = false;

      const [profile, availableCourses] = await Promise.all([
        loadStudentProfile(pool, userId),
        listAvailableCourses(pool),
      ]);

      return res.json({
        ok: true,
        profile: redactStudentFinance(profile),
        availableCourses,
      });
    } catch (e: any) {
      if (transactionOpen) {
        await client.query("ROLLBACK");
      }

      if (String(e?.code ?? "") === "23505") {
        if (String(e?.constraint ?? "").includes("public_student_id")) {
          return err(res, 400, "VALIDATION", "Student number already exists");
        }
        if (String(e?.constraint ?? "").includes("south_african_id")) {
          return err(res, 400, "VALIDATION", "ID number already exists");
        }
      }

      console.error("[students] PUT /student/profile error", e);
      return err(res, 500, "INTERNAL", "Failed to save student profile");
    } finally {
      client.release();
    }
  }
);

studentRouter.get(
  "/admin/imports/learners",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const onboardingStatus = parseOnboardingStatus(
        req.query.onboardingStatus ?? req.query.onboarding_status
      );
      if (onboardingStatus === undefined) {
        return err(
          res,
          400,
          "VALIDATION",
          "onboardingStatus must be PENDING_ACTIVATION, INVITED, ACTIVATED, or ALL"
        );
      }

      const activationRequired = parseOptionalBoolean(
        req.query.activationRequired ?? req.query.activation_required
      );
      if (activationRequired === undefined) {
        return err(res, 400, "VALIDATION", "activationRequired must be true or false");
      }

      const limit = parseLimit(req.query.limit, 50, 250);
      const offset = parseOffset(req.query.offset);
      const externalSource = singleQueryValue(
        req.query.externalSource ?? req.query.external_source ?? req.query.source
      ).toUpperCase();
      const q = singleQueryValue(req.query.q).toLowerCase();
      const params: unknown[] = [];
      const where: string[] = [
        `u.role = 'STUDENT'`,
        `(
          sp.verified_from_talent = true
          OR (
            NULLIF(btrim(COALESCE(sp.external_source, '')), '') IS NOT NULL
            AND NULLIF(btrim(COALESCE(sp.external_source_id, '')), '') IS NOT NULL
          )
        )`,
      ];

      if (onboardingStatus) {
        params.push(onboardingStatus);
        where.push(`sp.onboarding_status = $${params.length}`);
      }

      if (activationRequired !== null) {
        params.push(activationRequired);
        where.push(`COALESCE(sp.activation_required, false) = $${params.length}::boolean`);
      }

      if (externalSource) {
        params.push(externalSource);
        where.push(`upper(COALESCE(sp.external_source, '')) = $${params.length}`);
      }

      if (q) {
        params.push(`%${q}%`);
        where.push(`(
          lower(u.email) LIKE $${params.length}
          OR lower(COALESCE(u.first_name, '')) LIKE $${params.length}
          OR lower(COALESCE(u.last_name, '')) LIKE $${params.length}
          OR lower(COALESCE(u.public_student_id, '')) LIKE $${params.length}
          OR lower(COALESCE(sp.external_source_id, '')) LIKE $${params.length}
        )`);
      }

      params.push(limit);
      const limitIndex = params.length;
      params.push(offset);
      const offsetIndex = params.length;

      const result = await pool.query<ImportedLearnerListRow>(
        `
          SELECT
            COUNT(*) OVER()::text AS total_count,
            u.id AS user_id,
            u.email,
            u.first_name,
            u.last_name,
            u.public_student_id,
            active_course.id AS course_id,
            active_course.code AS course_code,
            active_course.name AS course_name,
            sp.external_source,
            sp.external_source_id,
            sp.activation_required,
            sp.onboarding_status,
            sp.activation_invited_at::text AS activation_invited_at,
            sp.activated_at::text AS activated_at,
            u.created_at::text AS created_at,
            sp.updated_at::text AS updated_at,
            EXISTS (
              SELECT 1
              FROM learner_activation_tokens lat
              WHERE lat.user_id = u.id
                AND lat.consumed_at IS NULL
                AND lat.revoked_at IS NULL
                AND lat.expires_at > now()
            ) AS has_active_activation_token
          FROM users u
          JOIN student_profiles sp ON sp.user_id = u.id
          LEFT JOIN LATERAL (
            SELECT c.id, c.code, c.name
            FROM student_courses sc
            JOIN courses c ON c.id = sc.course_id
            WHERE sc.student_user_id = u.id
              AND sc.status = 'ACTIVE'
            ORDER BY sc.enrolled_at DESC, lower(c.name) ASC
            LIMIT 1
          ) active_course ON true
          WHERE ${where.join(" AND ")}
          ORDER BY
            CASE sp.onboarding_status
              WHEN 'PENDING_ACTIVATION' THEN 0
              WHEN 'INVITED' THEN 1
              WHEN 'ACTIVATED' THEN 2
              ELSE 3
            END ASC,
            sp.activation_invited_at DESC NULLS LAST,
            sp.updated_at DESC NULLS LAST,
            u.created_at DESC
          LIMIT $${limitIndex}
          OFFSET $${offsetIndex}
        `,
        params
      );

      const value = result.rows.map(mapImportedLearner);
      const total = Number(result.rows[0]?.total_count ?? value.length);

      return res.json({
        value,
        count: value.length,
        total,
        limit,
        offset,
      });
    } catch (e) {
      console.error("[students] GET /admin/imports/learners error", e);
      return err(res, 500, "INTERNAL", "Failed to load imported learners");
    }
  }
);

studentRouter.post(
  "/admin/imports/approved-learner",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      const payload = {
        firstName: req.body?.first_name ?? req.body?.firstName,
        lastName: req.body?.last_name ?? req.body?.lastName,
        email: req.body?.email,
        phone: req.body?.phone ?? req.body?.mobile_number ?? req.body?.mobileNumber,
        nationalId:
          req.body?.national_id ??
          req.body?.id_number ??
          req.body?.nationalId ??
          req.body?.idNumber,
        courseId: req.body?.course_id ?? req.body?.courseId,
        courseCode: req.body?.course_code ?? req.body?.courseCode,
        externalSource: req.body?.external_source ?? req.body?.externalSource,
        externalSourceId: req.body?.external_source_id ?? req.body?.externalSourceId,
        metadata: req.body?.metadata ?? null,
      };

      await client.query("BEGIN");
      transactionOpen = true;

      const summary = await ingestApprovedLearner(client, payload);

      await client.query("COMMIT");
      transactionOpen = false;

      return res.status(summary.action === "created" ? 201 : 200).json({
        ok: true,
        summary,
      });
    } catch (e: any) {
      if (transactionOpen) {
        await client.query("ROLLBACK");
      }

      if (e instanceof LearnerImportError) {
        return err(res, e.status, e.code, e.message);
      }

      if (String(e?.code ?? "") === "23505") {
        const constraint = String(e?.constraint ?? "");
        if (constraint.includes("users_email_key")) {
          return err(res, 409, "CONFLICT", "Learner email already belongs to another account");
        }
        if (constraint.includes("south_african_id")) {
          return err(res, 409, "CONFLICT", "Learner national ID already belongs to another account");
        }
        if (constraint.includes("external_source")) {
          return err(res, 409, "CONFLICT", "externalSourceId already belongs to another learner");
        }
        if (constraint.includes("public_student_id")) {
          return err(res, 409, "CONFLICT", "A student number collision occurred. Retry the import.");
        }
      }

      console.error("[students] POST /admin/imports/approved-learner error", e);
      return err(res, 500, "INTERNAL", "Failed to import approved learner");
    } finally {
      client.release();
    }
  }
);

studentRouter.post(
  "/admin/imports/approved-learners/csv",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  csvImportUploadMiddleware,
  async (req, res) => {
    try {
      let csvText = "";

      if (req.file) {
        if (!isSupportedCsvUpload(req.file)) {
          return err(res, 400, "VALIDATION", "Upload must be a CSV file");
        }
        csvText = req.file.buffer.toString("utf8");
      } else if (typeof req.body?.csv === "string") {
        csvText = req.body.csv;
      }

      if (!csvText.trim()) {
        return err(res, 400, "VALIDATION", "CSV content is required");
      }

      const report = await importApprovedLearnersFromCsv(pool, csvText);

      return res.json({
        ok: true,
        summary: {
          totalRows: report.totalRows,
          createdCount: report.createdCount,
          updatedCount: report.updatedCount,
          skippedCount: report.skippedCount,
          failedCount: report.failedCount,
        },
        results: report.results,
      });
    } catch (e: any) {
      if (e instanceof CsvImportError) {
        return err(res, e.status, e.code, e.message);
      }

      console.error("[students] POST /admin/imports/approved-learners/csv error", e);
      return err(res, 500, "INTERNAL", "Failed to import approved learners CSV");
    }
  }
);

studentRouter.post(
  "/admin/imports/:userId/send-activation",
  requireAccess({ roles: ["ADMIN"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const userId = toTrimmedString(req.params.userId);
      if (!isUuid(userId)) return err(res, 400, "VALIDATION", "userId must be a UUID");

      const activation = await issueLearnerActivation(pool, {
        userId,
        issuedByUserId: req.user?.id ?? null,
      });

      return res.json({
        ok: true,
        activation,
      });
    } catch (e: any) {
      if (e instanceof LearnerActivationError) {
        const operationalStatus = learnerActivationIssueStatus(e);
        if (operationalStatus) {
          return res.status(e.status).json({
            error: {
              code: e.code,
              message: e.message,
            },
            activation: {
              issued: false,
              operationalStatus,
            },
          });
        }
        return err(res, e.status, e.code, e.message);
      }

      console.error("[students] POST /admin/imports/:userId/send-activation error", e);
      return err(res, 500, "INTERNAL", "Failed to issue learner activation");
    }
  }
);

studentRouter.get(
  "/students",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const viewer = req.user!;
      const limit = parseLimit(req.query.limit, 50, 250);
      const q = toTrimmedString(req.query.q).toLowerCase();
      const courseId = toTrimmedString(req.query.courseId);
      const params: unknown[] = [];
      const where: string[] = [`u.role = 'STUDENT'`];

      if (courseId) {
        if (!isUuid(courseId)) return err(res, 400, "VALIDATION", "courseId must be a UUID");

        params.push(courseId);
        where.push(`active_course.id = $${params.length}`);
      }

      if (viewer.role === "LECTURER") {
        if (courseId) {
          const allowed = await isLecturerAssignedToCourse(pool, viewer.id, courseId);
          if (!allowed) {
            return res.json({ value: [], count: 0 });
          }
        }

        params.push(viewer.id);
        const lecturerParamIndex = params.length;
        where.push(`
          EXISTS (
            SELECT 1
            FROM lecturer_module_assignments lma
            JOIN faculty_modules fm ON fm.id = lma.module_id
            JOIN student_module_enrollments sme
              ON sme.module_id = fm.id
             AND sme.student_id = u.id
            JOIN student_courses sc
              ON sc.student_user_id = sme.student_id
             AND sc.course_id = fm.course_id
             AND sc.status = 'ACTIVE'
            WHERE lma.lecturer_id = $${lecturerParamIndex}
          )
        `);
      }

      if (q) {
        params.push(`%${q}%`);
        where.push(`(
          lower(u.email) LIKE $${params.length}
          OR lower(COALESCE(u.first_name, '')) LIKE $${params.length}
          OR lower(COALESCE(u.last_name, '')) LIKE $${params.length}
          OR lower(COALESCE(u.public_student_id, '')) LIKE $${params.length}
          OR lower(COALESCE(u.south_african_id, '')) LIKE $${params.length}
          OR lower(COALESCE(active_course.name, '')) LIKE $${params.length}
        )`);
      }

      params.push(limit);

      const result = await pool.query<StudentListRow>(
        `
          SELECT
            u.id AS user_id,
            u.email,
            u.first_name AS full_name,
            u.last_name AS surname,
            u.public_student_id AS student_number,
            u.south_african_id AS id_number,
            active_course.id AS course_id,
            active_course.code AS course_code,
            active_course.name AS course_name,
            sp.completed_at
          FROM users u
          LEFT JOIN student_profiles sp ON sp.user_id = u.id
          LEFT JOIN LATERAL (
            SELECT c.id, c.code, c.name
            FROM student_courses sc
            JOIN courses c ON c.id = sc.course_id
            WHERE sc.student_user_id = u.id
              AND sc.status = 'ACTIVE'
            ORDER BY sc.enrolled_at DESC, lower(c.name) ASC
            LIMIT 1
          ) active_course ON true
          WHERE ${where.join(" AND ")}
          ORDER BY lower(COALESCE(u.last_name, u.first_name, u.email)) ASC, lower(u.email) ASC
          LIMIT $${params.length}
        `,
        params
      );

      const value = result.rows.map((row) => ({
          userId: row.user_id,
          email: row.email,
          fullName: row.full_name?.trim() ?? "",
          surname: row.surname?.trim() ?? "",
          studentNumber: row.student_number?.trim() ?? "",
          idNumber: row.id_number?.trim() ?? "",
          courseId: row.course_id,
          courseCode: row.course_code,
          courseName: row.course_name,
          isComplete: Boolean(row.completed_at),
        }));

      return res.json({ value, count: value.length });
    } catch (e) {
      console.error("[students] GET /students error", e);
      return err(res, 500, "INTERNAL", "Failed to load students");
    }
  }
);

studentRouter.get(
  "/students/:id",
  requireAccess({ roles: ["ADMIN", "LECTURER"], adminScopes: ["ACADEMIC", "SUPER"] }),
  async (req, res) => {
    try {
      const viewer = req.user!;
      const studentId = toTrimmedString(req.params.id);
      if (!isUuid(studentId)) return err(res, 400, "VALIDATION", "id must be a UUID");

      if (!(await ensureStudentExists(studentId))) {
        return err(res, 404, "NOT_FOUND", "Student not found");
      }

      const allowed = await ensureViewerCanAccessStudent(viewer, studentId);
      if (!allowed) return err(res, 403, "FORBIDDEN", "Not allowed to view this student");

      const profile = await loadStudentProfile(pool, studentId);
      if (!profile) {
        return err(res, 404, "NOT_FOUND", "Student not found");
      }

      return res.json({ profile: redactStudentFinance(profile) });
    } catch (e) {
      console.error("[students] GET /students/:id error", e);
      return err(res, 500, "INTERNAL", "Failed to load student profile");
    }
  }
);
