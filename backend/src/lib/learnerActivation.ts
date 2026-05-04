import bcrypt from "bcryptjs";
import crypto from "crypto";
import { env } from "../config/env";
import { validatePassword } from "./passwordPolicy";

export type LearnerOnboardingStatus = "PENDING_ACTIVATION" | "INVITED" | "ACTIVATED";

type Queryable = {
  query: <T>(
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ActivationClient = Queryable & {
  release: () => void;
};

type ActivationPool = Queryable & {
  connect: () => Promise<ActivationClient>;
};

type ActivationLearnerRow = {
  id: string;
  email: string;
  role: string;
  public_student_id: string | null;
  verified_from_talent: boolean | null;
  external_source: string | null;
  external_source_id: string | null;
  activation_required: boolean | null;
  onboarding_status: LearnerOnboardingStatus | null;
  activated_at: string | null;
};

type TokenLookupRow = {
  token_id: string;
  user_id: string;
  email: string;
  role: string;
  public_student_id: string | null;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
  activation_required: boolean | null;
  onboarding_status: LearnerOnboardingStatus | null;
  activated_at: string | null;
};

export type IssueActivationResult = {
  issued: true;
  issueType: "first_issue" | "reissue";
  operationalStatus: "issued" | "reissued";
  userId: string;
  email: string;
  studentNumber: string | null;
  expiresAt: string;
  activationRequired: boolean;
  onboardingStatus: LearnerOnboardingStatus;
  devActivationToken?: string;
  devActivationUrl?: string;
};

export type ActivationValidationResult = {
  email: string;
  studentNumber: string | null;
  expiresAt: string;
  activationRequired: boolean;
  onboardingStatus: LearnerOnboardingStatus | null;
};

export type CompleteActivationResult = {
  userId: string;
  email: string;
  studentNumber: string | null;
  activationRequired: boolean;
  onboardingStatus: LearnerOnboardingStatus;
};

export class LearnerActivationError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "LearnerActivationError";
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_ACTIVATION_TTL_HOURS = 7 * 24;

function activationTtlHours(): number {
  const raw = Number(process.env.LEARNER_ACTIVATION_TTL_HOURS ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_ACTIVATION_TTL_HOURS;
}

function generateActivationToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function normalizeActivationToken(value: unknown): string {
  return String(value ?? "").trim();
}

function hashActivationToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function expiresAtFromNow(): string {
  return new Date(Date.now() + activationTtlHours() * 60 * 60 * 1000).toISOString();
}

function canExposeDevActivationToken(): boolean {
  return env.APP_ENV === "test" || env.APP_ENV === "development" || env.APP_ENV === "local";
}

function isTrustedImportedLearner(row: ActivationLearnerRow): boolean {
  return Boolean(
    row.verified_from_talent ||
      (String(row.external_source ?? "").trim() &&
        String(row.external_source_id ?? "").trim())
  );
}

function isActivated(row: Pick<ActivationLearnerRow, "activated_at" | "onboarding_status">): boolean {
  return Boolean(row.activated_at || row.onboarding_status === "ACTIVATED");
}

function devActivationUrl(token: string): string {
  return `/activate?token=${encodeURIComponent(token)}`;
}

async function loadActivationLearner(
  db: Queryable,
  userId: string
): Promise<ActivationLearnerRow | null> {
  const result = await db.query<ActivationLearnerRow>(
    `
      SELECT
        u.id,
        u.email,
        u.role,
        u.public_student_id,
        sp.verified_from_talent,
        sp.external_source,
        sp.external_source_id,
        sp.activation_required,
        sp.onboarding_status,
        sp.activated_at::text AS activated_at
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
      FOR UPDATE OF u
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

export async function issueLearnerActivation(
  db: ActivationPool,
  input: { userId: string; issuedByUserId: string | null }
): Promise<IssueActivationResult> {
  const client = await db.connect();
  const rawToken = generateActivationToken();
  const tokenHash = hashActivationToken(rawToken);
  const expiresAt = expiresAtFromNow();

  try {
    await client.query("BEGIN");

    const learner = await loadActivationLearner(client, input.userId);
    if (!learner) {
      throw new LearnerActivationError(404, "NOT_FOUND", "Learner account was not found");
    }
    if (learner.role !== "STUDENT") {
      throw new LearnerActivationError(409, "CONFLICT", "Activation can only be issued for student accounts");
    }
    if (!isTrustedImportedLearner(learner)) {
      throw new LearnerActivationError(409, "CONFLICT", "Activation can only be issued for imported learners");
    }
    if (isActivated(learner)) {
      throw new LearnerActivationError(409, "CONFLICT", "Learner account is already activated");
    }

    const existingToken = await client.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM learner_activation_tokens
        WHERE user_id = $1
      `,
      [input.userId]
    );
    const issueType = Number(existingToken.rows[0]?.c ?? "0") > 0 ? "reissue" : "first_issue";

    await client.query(
      `
        UPDATE learner_activation_tokens
        SET revoked_at = now()
        WHERE user_id = $1
          AND consumed_at IS NULL
          AND revoked_at IS NULL
      `,
      [input.userId]
    );

    await client.query(
      `
        INSERT INTO learner_activation_tokens (
          user_id,
          token_hash,
          expires_at,
          created_by
        )
        VALUES ($1, $2, $3::timestamptz, $4)
      `,
      [input.userId, tokenHash, expiresAt, input.issuedByUserId]
    );

    const updatedProfile = await client.query<{
      activation_required: boolean;
      onboarding_status: LearnerOnboardingStatus;
    }>(
      `
        UPDATE student_profiles
        SET
          activation_required = true,
          onboarding_status = 'INVITED',
          activation_invited_at = now(),
          updated_at = now()
        WHERE user_id = $1
          AND activated_at IS NULL
          AND COALESCE(onboarding_status, '') <> 'ACTIVATED'
        RETURNING activation_required, onboarding_status
      `,
      [input.userId]
    );

    if ((updatedProfile.rowCount ?? 0) === 0) {
      throw new LearnerActivationError(409, "CONFLICT", "Learner activation state could not be updated");
    }

    await client.query("COMMIT");

    const response: IssueActivationResult = {
      issued: true,
      issueType,
      operationalStatus: issueType === "reissue" ? "reissued" : "issued",
      userId: learner.id,
      email: learner.email,
      studentNumber: learner.public_student_id,
      expiresAt,
      activationRequired: true,
      onboardingStatus: updatedProfile.rows[0].onboarding_status,
    };

    if (canExposeDevActivationToken()) {
      response.devActivationToken = rawToken;
      response.devActivationUrl = devActivationUrl(rawToken);
    }

    return response;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original activation error.
    }
    throw e;
  } finally {
    client.release();
  }
}

async function loadToken(
  db: Queryable,
  token: string,
  lock: boolean
): Promise<TokenLookupRow | null> {
  const tokenHash = hashActivationToken(token);
  const result = await db.query<TokenLookupRow>(
    `
      SELECT
        lat.id AS token_id,
        lat.user_id,
        u.email,
        u.role,
        u.public_student_id,
        lat.expires_at::text AS expires_at,
        lat.consumed_at::text AS consumed_at,
        lat.revoked_at::text AS revoked_at,
        sp.activation_required,
        sp.onboarding_status,
        sp.activated_at::text AS activated_at
      FROM learner_activation_tokens lat
      JOIN users u ON u.id = lat.user_id
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE lat.token_hash = $1
      LIMIT 1
      ${lock ? "FOR UPDATE OF lat, u" : ""}
    `,
    [tokenHash]
  );

  return result.rows[0] ?? null;
}

function assertUsableToken(row: TokenLookupRow | null): TokenLookupRow {
  if (!row) {
    throw new LearnerActivationError(400, "VALIDATION", "Activation token is invalid");
  }
  if (row.consumed_at) {
    throw new LearnerActivationError(400, "VALIDATION", "Activation token has already been used");
  }
  if (row.revoked_at) {
    throw new LearnerActivationError(400, "VALIDATION", "Activation token is invalid");
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new LearnerActivationError(400, "VALIDATION", "Activation token has expired");
  }
  if (row.role !== "STUDENT") {
    throw new LearnerActivationError(400, "VALIDATION", "Activation token is invalid");
  }
  if (row.activated_at || row.onboarding_status === "ACTIVATED") {
    throw new LearnerActivationError(409, "CONFLICT", "Learner account is already activated");
  }

  return row;
}

export async function validateLearnerActivationToken(
  db: Queryable,
  tokenInput: unknown
): Promise<ActivationValidationResult> {
  const token = normalizeActivationToken(tokenInput);
  if (!token) {
    throw new LearnerActivationError(400, "VALIDATION", "Activation token is required");
  }

  const row = assertUsableToken(await loadToken(db, token, false));
  return {
    email: row.email,
    studentNumber: row.public_student_id,
    expiresAt: row.expires_at,
    activationRequired: Boolean(row.activation_required),
    onboardingStatus: row.onboarding_status,
  };
}

export async function completeLearnerActivation(
  db: ActivationPool,
  input: {
    token: unknown;
    password: unknown;
    acceptedLegalTerms?: unknown;
  }
): Promise<CompleteActivationResult> {
  const token = normalizeActivationToken(input.token);
  if (!token) {
    throw new LearnerActivationError(400, "VALIDATION", "Activation token is required");
  }

  const passwordError = validatePassword(input.password);
  if (passwordError) {
    throw new LearnerActivationError(400, "VALIDATION", passwordError);
  }

  const passwordHash = await bcrypt.hash(String(input.password ?? ""), 10);
  const acceptedLegalTerms = input.acceptedLegalTerms === true;
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const row = assertUsableToken(await loadToken(client, token, true));

    await client.query(
      `
        UPDATE users
        SET
          password_hash = $2,
          accepted_legal_terms_at = CASE
            WHEN $3::boolean THEN COALESCE(accepted_legal_terms_at, now())
            ELSE accepted_legal_terms_at
          END
        WHERE id = $1
      `,
      [row.user_id, passwordHash, acceptedLegalTerms]
    );

    const updatedProfile = await client.query<{
      activation_required: boolean;
      onboarding_status: LearnerOnboardingStatus;
    }>(
      `
        UPDATE student_profiles
        SET
          activation_required = false,
          onboarding_status = 'ACTIVATED',
          activated_at = COALESCE(activated_at, now()),
          updated_at = now()
        WHERE user_id = $1
        RETURNING activation_required, onboarding_status
      `,
      [row.user_id]
    );

    if ((updatedProfile.rowCount ?? 0) === 0) {
      throw new LearnerActivationError(409, "CONFLICT", "Learner activation state could not be completed");
    }

    await client.query(
      `
        UPDATE learner_activation_tokens
        SET consumed_at = now()
        WHERE id = $1
      `,
      [row.token_id]
    );

    await client.query(
      `
        UPDATE learner_activation_tokens
        SET revoked_at = now()
        WHERE user_id = $1
          AND id <> $2
          AND consumed_at IS NULL
          AND revoked_at IS NULL
      `,
      [row.user_id, row.token_id]
    );

    await client.query("COMMIT");

    return {
      userId: row.user_id,
      email: row.email,
      studentNumber: row.public_student_id,
      activationRequired: updatedProfile.rows[0].activation_required,
      onboardingStatus: updatedProfile.rows[0].onboarding_status,
    };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original activation error.
    }
    throw e;
  } finally {
    client.release();
  }
}
