const ingestApprovedLearnerMock = jest.fn();

jest.mock("../lib/learnerImports", () => ({
  DEFAULT_CSV_LEARNER_IMPORT_SOURCE: "FORGE_TALENT_CSV",
  LearnerImportError: class LearnerImportError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.name = "LearnerImportError";
    }
  },
  ingestApprovedLearner: ingestApprovedLearnerMock,
}));

import {
  CsvImportError,
  importApprovedLearnersFromCsv,
  parseApprovedLearnerCsv,
} from "../lib/learnerCsvImport";

function buildPool() {
  const queries: string[] = [];
  const client = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };
  return {
    pool: {
      connect: jest.fn(async () => client),
    },
    client,
    queries,
  };
}

describe("learner CSV import unit coverage", () => {
  beforeEach(() => {
    ingestApprovedLearnerMock.mockReset();
  });

  test("parses supported CSV rows with normalized headers and default CSV source", () => {
    const rows = parseApprovedLearnerCsv(
      [
        "First Name,last-name,email,phone,id_number,external_source_id,metadata_json",
        ' Alice , Example ,ALICE@EXAMPLE.COM, 0820000001 ,9901011234087,talent-1,"{""cohort"":""April""}"',
        ",,,,,,",
      ].join("\n")
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "ready",
      rowNumber: 2,
      email: "alice@example.com",
      externalSourceId: "talent-1",
    });
    expect(rows[0].kind === "ready" ? rows[0].input : null).toMatchObject({
      firstName: "Alice",
      lastName: "Example",
      email: "alice@example.com",
      phone: "0820000001",
      nationalId: "9901011234087",
      externalSource: "FORGE_TALENT_CSV",
      externalSourceId: "talent-1",
      metadata: { cohort: "April" },
    });
    expect(rows[1]).toMatchObject({
      kind: "skipped",
      rowNumber: 3,
      message: "Blank row skipped",
    });
  });

  test("rejects unsupported headers as a file-level validation error", () => {
    expect(() =>
      parseApprovedLearnerCsv(
        "first_name,last_name,email,external_source_id,unexpected\nAlice,Example,a@example.com,talent-1,value"
      )
    ).toThrow(CsvImportError);
  });

  test("reports row-level validation errors without throwing for bad row data", () => {
    const rows = parseApprovedLearnerCsv(
      [
        "first_name,last_name,email,external_source_id,metadata_json",
        "Alice,Example,not-an-email,talent-1,{bad-json",
      ].join("\n")
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "failed",
      rowNumber: 2,
    });
    expect(rows[0].kind === "failed" ? rows[0].message : "").toContain("email is invalid");
    expect(rows[0].kind === "failed" ? rows[0].message : "").toContain("metadata_json");
  });

  test("bulk import uses the shared approved-learner intake service per valid row", async () => {
    const { pool, client, queries } = buildPool();
    ingestApprovedLearnerMock.mockResolvedValueOnce({
      action: "created",
      matchedBy: "created",
      userId: "student-1",
      email: "csv@example.com",
      studentNumber: "STU-2026-0001",
      courseLinked: true,
      courseId: "11111111-1111-4111-8111-111111111111",
      warnings: [],
      sourceMetadataStored: true,
      source: {
        verifiedFromTalent: true,
        externalSource: "FORGE_TALENT_CSV",
        externalSourceId: "csv-1",
        lockedFields: ["email"],
      },
    });

    const report = await importApprovedLearnersFromCsv(
      pool,
      [
        "first_name,last_name,email,external_source_id,course_id",
        "Csv,Valid,csv@example.com,csv-1,11111111-1111-4111-8111-111111111111",
        "Csv,Bad,not-an-email,csv-2,",
      ].join("\n")
    );

    expect(ingestApprovedLearnerMock).toHaveBeenCalledTimes(1);
    expect(ingestApprovedLearnerMock.mock.calls[0][1]).toMatchObject({
      firstName: "Csv",
      lastName: "Valid",
      email: "csv@example.com",
      externalSource: "FORGE_TALENT_CSV",
      externalSourceId: "csv-1",
      courseId: "11111111-1111-4111-8111-111111111111",
    });
    expect(queries).toEqual(["BEGIN", "COMMIT"]);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({
      totalRows: 2,
      createdCount: 1,
      failedCount: 1,
      skippedCount: 0,
      updatedCount: 0,
    });
    expect(report.results[0]).toMatchObject({
      outcome: "CREATED",
      userId: "student-1",
      studentNumber: "STU-2026-0001",
      courseLinked: true,
    });
    expect(report.results[1]).toMatchObject({
      outcome: "FAILED",
      email: "not-an-email",
    });
  });

  test("rolls back one failed intake row and continues reporting cleanly", async () => {
    const { pool, client, queries } = buildPool();
    ingestApprovedLearnerMock.mockRejectedValueOnce(
      Object.assign(new Error("duplicate source"), {
        code: "23505",
        constraint: "idx_student_profiles_external_source_unique",
      })
    );

    const report = await importApprovedLearnersFromCsv(
      pool,
      [
        "first_name,last_name,email,external_source_id",
        "Csv,Duplicate,dup@example.com,csv-dup",
      ].join("\n")
    );

    expect(ingestApprovedLearnerMock).toHaveBeenCalledTimes(1);
    expect(queries).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({
      totalRows: 1,
      failedCount: 1,
    });
    expect(report.results[0]).toMatchObject({
      outcome: "FAILED",
      message: "external_source_id already belongs to another learner",
    });
  });
});
