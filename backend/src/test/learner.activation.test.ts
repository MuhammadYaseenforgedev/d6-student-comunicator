import request from "supertest";
import { createApp } from "../app";
import { pool } from "../config/db";
import { cleanupTestUsers, createUser, signJwt } from "./helpers";

const app = createApp();
jest.setTimeout(30000);

const ORIGINAL_ENV = {
  APP_ENV: process.env.APP_ENV,
  AUTH_REQUIRE_OTP: process.env.AUTH_REQUIRE_OTP,
  AUTH_ALLOW_PASSWORD_LOGIN: process.env.AUTH_ALLOW_PASSWORD_LOGIN,
};

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function restoreEnvVar(name: keyof typeof ORIGINAL_ENV) {
  const value = ORIGINAL_ENV[name];
  if (typeof value === "string") process.env[name] = value;
  else delete process.env[name];
}

describe("imported learner activation foundation", () => {
  const unique = `test_activation_${Date.now()}`;
  let academicToken = "";
  let lecturerToken = "";
  let financeToken = "";
  let studentToken = "";
  let parentToken = "";

  beforeAll(async () => {
    process.env.APP_ENV = "test";

    const academicAdmin = await createUser("ADMIN", `${unique}_academic@co.za`, "Passw0rd!", "ACADEMIC");
    const lecturer = await createUser("LECTURER", `${unique}_lecturer@co.za`);
    const financeAdmin = await createUser("ADMIN", `${unique}_finance@co.za`, "Passw0rd!", "FINANCE");
    const student = await createUser("STUDENT", `${unique}_student@co.za`);
    const parent = await createUser("PARENT", `${unique}_parent@co.za`);

    academicToken = signJwt(academicAdmin);
    lecturerToken = signJwt(lecturer);
    financeToken = signJwt(financeAdmin);
    studentToken = signJwt(student);
    parentToken = signJwt(parent);
  });

  afterEach(() => {
    restoreEnvVar("AUTH_REQUIRE_OTP");
    restoreEnvVar("AUTH_ALLOW_PASSWORD_LOGIN");
  });

  afterAll(async () => {
    await cleanupTestUsers();
    restoreEnvVar("APP_ENV");
    restoreEnvVar("AUTH_REQUIRE_OTP");
    restoreEnvVar("AUTH_ALLOW_PASSWORD_LOGIN");
  });

  async function importLearner(tag: string) {
    const email = `${unique}_${tag}@co.za`;
    const externalSourceId = `${unique}-${tag}`;
    const res = await request(app)
      .post("/api/admin/imports/approved-learner")
      .set(auth(academicToken))
      .send({
        first_name: "Activation",
        last_name: tag,
        email,
        external_source_id: externalSourceId,
      });

    expect(res.status).toBe(201);
    return {
      email,
      externalSourceId,
      userId: String(res.body?.summary?.userId ?? ""),
      studentNumber: String(res.body?.summary?.studentNumber ?? ""),
      summary: res.body?.summary,
    };
  }

  async function issueActivation(userId: string) {
    const res = await request(app)
      .post(`/api/admin/imports/${userId}/send-activation`)
      .set(auth(academicToken));

    expect(res.status).toBe(200);
    expect(Boolean(res.body?.activation?.issued)).toBe(true);
    expect(String(res.body?.activation?.devActivationToken ?? "")).toBeTruthy();
    return res.body.activation as {
      devActivationToken: string;
      expiresAt: string;
      issueType: string;
      operationalStatus: string;
      onboardingStatus: string;
    };
  }

  async function listImportedLearners(query: Record<string, unknown> = {}) {
    const res = await request(app)
      .get("/api/admin/imports/learners")
      .set(auth(academicToken))
      .query(query);

    expect(res.status).toBe(200);
    return res.body as {
      value: Array<Record<string, unknown>>;
      count: number;
      total: number;
      limit: number;
      offset: number;
    };
  }

  test("imported learners are created in pending activation state", async () => {
    const imported = await importLearner("pending");

    expect(Boolean(imported.summary?.activationRequired)).toBe(true);
    expect(String(imported.summary?.onboardingStatus ?? "")).toBe("PENDING_ACTIVATION");

    const profile = await pool.query<{
      activation_required: boolean;
      onboarding_status: string | null;
      activated_at: string | null;
    }>(
      `
        SELECT activation_required, onboarding_status, activated_at::text AS activated_at
        FROM student_profiles
        WHERE user_id = $1
        LIMIT 1
      `,
      [imported.userId]
    );

    expect(Boolean(profile.rows[0]?.activation_required)).toBe(true);
    expect(String(profile.rows[0]?.onboarding_status ?? "")).toBe("PENDING_ACTIVATION");
    expect(profile.rows[0]?.activated_at ?? null).toBeNull();
  });

  test("admin can issue activation and disallowed roles cannot", async () => {
    const imported = await importLearner("issue");

    for (const token of [financeToken, studentToken, parentToken]) {
      const denied = await request(app)
        .post(`/api/admin/imports/${imported.userId}/send-activation`)
        .set(auth(token));
      expect(denied.status).toBe(403);
    }

    const activation = await issueActivation(imported.userId);
    expect(activation.issueType).toBe("first_issue");
    expect(activation.operationalStatus).toBe("issued");
    expect(activation.onboardingStatus).toBe("INVITED");

    const reissue = await issueActivation(imported.userId);
    expect(reissue.issueType).toBe("reissue");
    expect(reissue.operationalStatus).toBe("reissued");
    expect(reissue.devActivationToken).not.toBe(activation.devActivationToken);

    const oldTokenRes = await request(app)
      .get("/api/auth/activate/validate")
      .query({ token: activation.devActivationToken });
    expect(oldTokenRes.status).toBe(400);
    expect(String(oldTokenRes.body?.error?.message ?? "")).toMatch(/invalid/i);

    const currentTokenRes = await request(app)
      .get("/api/auth/activate/validate")
      .query({ token: reissue.devActivationToken });
    expect(currentTokenRes.status).toBe(200);

    const activeTokens = await pool.query<{ c: string; invited_at: string | null }>(
      `
        SELECT
          COUNT(*)::text AS c,
          max(sp.activation_invited_at)::text AS invited_at
        FROM learner_activation_tokens lat
        JOIN student_profiles sp ON sp.user_id = lat.user_id
        WHERE lat.user_id = $1
          AND lat.consumed_at IS NULL
          AND lat.revoked_at IS NULL
          AND lat.expires_at > now()
      `,
      [imported.userId]
    );
    expect(Number(activeTokens.rows[0]?.c ?? "0")).toBe(1);
    expect(activeTokens.rows[0]?.invited_at ?? null).toBeTruthy();
  });

  test("admin can list imported learners by onboarding state without exposing token secrets", async () => {
    const pending = await importLearner("list_pending");
    const invited = await importLearner("list_invited");
    await issueActivation(invited.userId);

    const activated = await importLearner("list_activated");
    const activation = await issueActivation(activated.userId);
    const completeRes = await request(app).post("/api/auth/activate").send({
      token: activation.devActivationToken,
      password: "NewPassw0rd!",
    });
    expect(completeRes.status).toBe(200);

    const manualStudent = await createUser("STUDENT", `${unique}_list_manual@co.za`);
    await pool.query(
      `
        INSERT INTO student_profiles (user_id, activation_required, updated_at)
        VALUES ($1, false, now())
        ON CONFLICT (user_id) DO UPDATE
        SET activation_required = false, updated_at = now()
      `,
      [manualStudent.id]
    );

    const all = await listImportedLearners({ q: unique, limit: 100 });
    const allIds = new Set(all.value.map((row) => String(row.userId ?? "")));
    expect(allIds.has(pending.userId)).toBe(true);
    expect(allIds.has(invited.userId)).toBe(true);
    expect(allIds.has(activated.userId)).toBe(true);
    expect(allIds.has(manualStudent.id)).toBe(false);

    const invitedRow = all.value.find((row) => row.userId === invited.userId);
    expect(invitedRow).toMatchObject({
      onboardingStatus: "INVITED",
      activationRequired: true,
      hasActiveActivationToken: true,
      canReissueActivation: true,
    });

    const activatedRow = all.value.find((row) => row.userId === activated.userId);
    expect(activatedRow).toMatchObject({
      onboardingStatus: "ACTIVATED",
      activationRequired: false,
      hasActiveActivationToken: false,
      canReissueActivation: false,
    });

    for (const row of all.value) {
      expect(row).not.toHaveProperty("tokenHash");
      expect(row).not.toHaveProperty("activationToken");
      expect(row).not.toHaveProperty("devActivationToken");
      expect(row).not.toHaveProperty("devActivationUrl");
    }

    const pendingOnly = await listImportedLearners({
      q: unique,
      onboardingStatus: "PENDING_ACTIVATION",
      limit: 100,
    });
    const pendingIds = new Set(pendingOnly.value.map((row) => String(row.userId ?? "")));
    expect(pendingIds.has(pending.userId)).toBe(true);
    expect(pendingIds.has(invited.userId)).toBe(false);
    expect(pendingIds.has(activated.userId)).toBe(false);

    const activationRequired = await listImportedLearners({
      q: unique,
      activationRequired: "true",
      limit: 100,
    });
    const requiredIds = new Set(activationRequired.value.map((row) => String(row.userId ?? "")));
    expect(requiredIds.has(pending.userId)).toBe(true);
    expect(requiredIds.has(invited.userId)).toBe(true);
    expect(requiredIds.has(activated.userId)).toBe(false);

    const forgeTalent = await listImportedLearners({
      q: unique,
      externalSource: "FORGE_TALENT",
      limit: 100,
    });
    const sourceIds = new Set(forgeTalent.value.map((row) => String(row.userId ?? "")));
    expect(sourceIds.has(pending.userId)).toBe(true);
    expect(sourceIds.has(invited.userId)).toBe(true);
    expect(sourceIds.has(activated.userId)).toBe(true);
  });

  test("imported learner onboarding list is RBAC protected", async () => {
    const lecturerAllowed = await request(app)
      .get("/api/admin/imports/learners")
      .set(auth(lecturerToken));
    expect(lecturerAllowed.status).toBe(200);

    for (const token of [financeToken, studentToken, parentToken]) {
      const denied = await request(app)
        .get("/api/admin/imports/learners")
        .set(auth(token));
      expect(denied.status).toBe(403);
    }
  });

  test("activation token validates, completes setup, and cannot be reused", async () => {
    const imported = await importLearner("complete");
    const activation = await issueActivation(imported.userId);
    const nextPassword = "NewPassw0rd!";

    const validateRes = await request(app)
      .get("/api/auth/activate/validate")
      .query({ token: activation.devActivationToken });
    expect(validateRes.status).toBe(200);
    expect(String(validateRes.body?.activation?.email ?? "")).toBe(imported.email);
    expect(String(validateRes.body?.activation?.studentNumber ?? "")).toBe(imported.studentNumber);

    const completeRes = await request(app).post("/api/auth/activate").send({
      token: activation.devActivationToken,
      password: nextPassword,
      acceptedLegalTerms: true,
    });
    expect(completeRes.status).toBe(200);
    expect(Boolean(completeRes.body?.activation?.activationRequired)).toBe(false);
    expect(String(completeRes.body?.activation?.onboardingStatus ?? "")).toBe("ACTIVATED");

    const reuseRes = await request(app).post("/api/auth/activate").send({
      token: activation.devActivationToken,
      password: "AnotherPassw0rd!",
    });
    expect(reuseRes.status).toBe(400);
    expect(String(reuseRes.body?.error?.message ?? "")).toMatch(/already been used/i);

    process.env.AUTH_REQUIRE_OTP = "false";
    process.env.AUTH_ALLOW_PASSWORD_LOGIN = "true";
    const loginRes = await request(app).post("/api/auth/login").send({
      email: imported.email,
      password: nextPassword,
      studentNumber: imported.studentNumber,
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body?.user?.role).toBe("STUDENT");
  });

  test("expired activation tokens are rejected", async () => {
    const imported = await importLearner("expired");
    const activation = await issueActivation(imported.userId);

    await pool.query(
      `
        UPDATE learner_activation_tokens
        SET expires_at = now() - interval '1 minute'
        WHERE user_id = $1
          AND consumed_at IS NULL
          AND revoked_at IS NULL
      `,
      [imported.userId]
    );

    const validateRes = await request(app)
      .get("/api/auth/activate/validate")
      .query({ token: activation.devActivationToken });
    expect(validateRes.status).toBe(400);
    expect(String(validateRes.body?.error?.message ?? "")).toMatch(/expired/i);

    const completeRes = await request(app).post("/api/auth/activate").send({
      token: activation.devActivationToken,
      password: "NewPassw0rd!",
    });
    expect(completeRes.status).toBe(400);
    expect(String(completeRes.body?.error?.message ?? "")).toMatch(/expired/i);
  });

  test("re-import does not reset an activated learner", async () => {
    const imported = await importLearner("reimport");
    const activation = await issueActivation(imported.userId);

    const completeRes = await request(app).post("/api/auth/activate").send({
      token: activation.devActivationToken,
      password: "NewPassw0rd!",
    });
    expect(completeRes.status).toBe(200);

    const reissueActivatedRes = await request(app)
      .post(`/api/admin/imports/${imported.userId}/send-activation`)
      .set(auth(academicToken));
    expect(reissueActivatedRes.status).toBe(409);
    expect(String(reissueActivatedRes.body?.error?.message ?? "")).toMatch(/already activated/i);
    expect(String(reissueActivatedRes.body?.activation?.operationalStatus ?? "")).toBe(
      "already_activated"
    );

    const before = await pool.query<{ activated_at: string | null }>(
      `
        SELECT activated_at::text AS activated_at
        FROM student_profiles
        WHERE user_id = $1
        LIMIT 1
      `,
      [imported.userId]
    );

    const reimportRes = await request(app)
      .post("/api/admin/imports/approved-learner")
      .set(auth(academicToken))
      .send({
        first_name: "Activation",
        last_name: "Updated",
        email: imported.email,
        external_source_id: imported.externalSourceId,
      });

    expect(reimportRes.status).toBe(200);
    expect(String(reimportRes.body?.summary?.action ?? "")).toBe("updated");
    expect(Boolean(reimportRes.body?.summary?.activationRequired)).toBe(false);
    expect(String(reimportRes.body?.summary?.onboardingStatus ?? "")).toBe("ACTIVATED");

    const after = await pool.query<{
      activation_required: boolean;
      onboarding_status: string | null;
      activated_at: string | null;
    }>(
      `
        SELECT activation_required, onboarding_status, activated_at::text AS activated_at
        FROM student_profiles
        WHERE user_id = $1
        LIMIT 1
      `,
      [imported.userId]
    );

    expect(Boolean(after.rows[0]?.activation_required)).toBe(false);
    expect(String(after.rows[0]?.onboarding_status ?? "")).toBe("ACTIVATED");
    expect(after.rows[0]?.activated_at).toBe(before.rows[0]?.activated_at);
  });

  test("existing non-imported users are not eligible for imported learner activation", async () => {
    const manualStudent = await createUser("STUDENT", `${unique}_manual_student@co.za`);

    const res = await request(app)
      .post(`/api/admin/imports/${manualStudent.id}/send-activation`)
      .set(auth(academicToken));

    expect(res.status).toBe(409);
    expect(String(res.body?.error?.message ?? "")).toMatch(/imported learners/i);
    expect(String(res.body?.activation?.operationalStatus ?? "")).toBe("not_eligible");
  });
});
