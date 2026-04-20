import {
  DEFAULT_CSV_LEARNER_IMPORT_SOURCE,
  ingestApprovedLearner,
  LearnerImportError,
  type ApprovedLearnerInput,
} from "./learnerImports";
import type { Queryable } from "./studentNumbers";

type CsvImportClient = Queryable & {
  release: () => void;
};

type CsvImportPool = {
  connect: () => Promise<CsvImportClient>;
};

type PreparedCsvRow =
  | {
      kind: "ready";
      rowNumber: number;
      email: string;
      externalSourceId: string;
      input: ApprovedLearnerInput;
    }
  | {
      kind: "skipped" | "failed";
      rowNumber: number;
      email: string | null;
      externalSourceId: string | null;
      message: string;
      warnings: string[];
    };

export type CsvImportOutcome = "CREATED" | "UPDATED" | "SKIPPED" | "FAILED";

export type CsvImportRowResult = {
  rowNumber: number;
  email: string | null;
  externalSourceId: string | null;
  outcome: CsvImportOutcome;
  message: string;
  userId: string | null;
  studentNumber: string | null;
  courseLinked: boolean;
  warnings: string[];
};

export type CsvImportReport = {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  results: CsvImportRowResult[];
};

export class CsvImportError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CsvImportError";
    this.status = status;
    this.code = code;
  }
}

const REQUIRED_HEADERS = ["first_name", "last_name", "email", "external_source_id"];
const SUPPORTED_HEADERS = new Set([
  "first_name",
  "last_name",
  "email",
  "phone",
  "id_number",
  "external_source_id",
  "course_id",
  "course_code",
  "external_source",
  "metadata_json",
]);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeCell(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeEmail(value: unknown): string {
  return normalizeCell(value).toLowerCase();
}

function normalizeExternalSource(value: unknown): string {
  const normalized = normalizeCell(value).toUpperCase();
  return normalized || DEFAULT_CSV_LEARNER_IMPORT_SOURCE;
}

function parseCsvRecords(csvText: string): string[][] {
  if (!csvText.trim()) {
    throw new CsvImportError(400, "VALIDATION", "CSV file is empty");
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let lastWasLineBreak = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];

    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      lastWasLineBreak = false;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      lastWasLineBreak = false;
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (char === "\r" && csvText[i + 1] === "\n") i += 1;
      lastWasLineBreak = true;
      continue;
    }

    field += char;
    lastWasLineBreak = false;
  }

  if (inQuotes) {
    throw new CsvImportError(400, "VALIDATION", "CSV contains an unterminated quoted field");
  }

  if (!lastWasLineBreak || field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function validateHeaders(rawHeaders: string[]): string[] {
  const headers = rawHeaders.map(normalizeHeader);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const unsupported = new Set<string>();

  for (const header of headers) {
    if (!header) {
      throw new CsvImportError(400, "VALIDATION", "CSV contains a blank header");
    }
    if (seen.has(header)) duplicates.add(header);
    seen.add(header);
    if (!SUPPORTED_HEADERS.has(header)) unsupported.add(header);
  }

  if (duplicates.size > 0) {
    throw new CsvImportError(400, "VALIDATION", `CSV contains duplicate headers: ${Array.from(duplicates).join(", ")}`);
  }

  if (unsupported.size > 0) {
    throw new CsvImportError(400, "VALIDATION", `CSV contains unsupported headers: ${Array.from(unsupported).join(", ")}`);
  }

  const missing = REQUIRED_HEADERS.filter((header) => !seen.has(header));
  if (missing.length > 0) {
    throw new CsvImportError(400, "VALIDATION", `CSV is missing required headers: ${missing.join(", ")}`);
  }

  return headers;
}

function parseMetadataJson(value: string): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("metadata_json must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : "invalid JSON";
    const message = rawMessage.includes("metadata_json")
      ? rawMessage
      : `metadata_json is invalid JSON: ${rawMessage}`;
    throw new CsvImportError(400, "VALIDATION", message);
  }
}

function buildRowObject(headers: string[], values: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  headers.forEach((header, index) => {
    row[header] = normalizeCell(values[index]);
  });
  return row;
}

function prepareCsvRow(headers: string[], values: string[], rowNumber: number): PreparedCsvRow {
  const rowValues = values.map(normalizeCell);
  if (rowValues.every((value) => !value)) {
    return {
      kind: "skipped",
      rowNumber,
      email: null,
      externalSourceId: null,
      message: "Blank row skipped",
      warnings: [],
    };
  }

  if (values.length > headers.length && values.slice(headers.length).some((value) => normalizeCell(value))) {
    return {
      kind: "failed",
      rowNumber,
      email: null,
      externalSourceId: null,
      message: "Row has more values than the CSV header",
      warnings: [],
    };
  }

  const row = buildRowObject(headers, values);
  const email = normalizeEmail(row.email);
  const externalSourceId = normalizeCell(row.external_source_id);
  const externalSource = normalizeExternalSource(row.external_source);
  const courseId = normalizeCell(row.course_id);
  const courseCode = normalizeCell(row.course_code);
  const errors: string[] = [];

  if (!normalizeCell(row.first_name)) errors.push("first_name is required");
  if (!normalizeCell(row.last_name)) errors.push("last_name is required");
  if (!email) errors.push("email is required");
  if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push("email is invalid");
  if (!externalSourceId) errors.push("external_source_id is required");
  if (courseId && !isUuid(courseId)) errors.push("course_id must be a UUID");
  if (!/^[A-Z0-9_-]{2,64}$/.test(externalSource)) {
    errors.push("external_source must contain only letters, numbers, underscores, or hyphens");
  }

  let metadata: Record<string, unknown> | null = null;
  try {
    metadata = parseMetadataJson(normalizeCell(row.metadata_json));
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "metadata_json is invalid JSON");
  }

  if (errors.length > 0) {
    return {
      kind: "failed",
      rowNumber,
      email: email || null,
      externalSourceId: externalSourceId || null,
      message: errors.join("; "),
      warnings: [],
    };
  }

  return {
    kind: "ready",
    rowNumber,
    email,
    externalSourceId,
    input: {
      firstName: row.first_name,
      lastName: row.last_name,
      email,
      phone: normalizeCell(row.phone) || null,
      nationalId: normalizeCell(row.id_number) || null,
      courseId: courseId || null,
      courseCode: courseCode || null,
      externalSource,
      externalSourceId,
      metadata,
    },
  };
}

export function parseApprovedLearnerCsv(csvText: string): PreparedCsvRow[] {
  const records = parseCsvRecords(csvText);
  if (records.length === 0) {
    throw new CsvImportError(400, "VALIDATION", "CSV file is empty");
  }

  const headers = validateHeaders(records[0]);
  return records.slice(1).map((values, index) => prepareCsvRow(headers, values, index + 2));
}

function pgErrorMessage(e: any): string {
  if (e instanceof LearnerImportError || e instanceof CsvImportError) {
    return e.message;
  }

  if (String(e?.code ?? "") === "23505") {
    const constraint = String(e?.constraint ?? "");
    if (constraint.includes("users_email_key")) return "Learner email already belongs to another account";
    if (constraint.includes("south_african_id")) return "Learner national ID already belongs to another account";
    if (constraint.includes("external_source")) return "external_source_id already belongs to another learner";
    if (constraint.includes("public_student_id")) return "A student number collision occurred. Retry the import.";
  }

  return "Failed to import learner row";
}

function emptyRowResult(row: Extract<PreparedCsvRow, { kind: "skipped" | "failed" }>): CsvImportRowResult {
  return {
    rowNumber: row.rowNumber,
    email: row.email,
    externalSourceId: row.externalSourceId,
    outcome: row.kind === "skipped" ? "SKIPPED" : "FAILED",
    message: row.message,
    userId: null,
    studentNumber: null,
    courseLinked: false,
    warnings: row.warnings,
  };
}

function buildReport(results: CsvImportRowResult[]): CsvImportReport {
  return {
    totalRows: results.length,
    createdCount: results.filter((row) => row.outcome === "CREATED").length,
    updatedCount: results.filter((row) => row.outcome === "UPDATED").length,
    skippedCount: results.filter((row) => row.outcome === "SKIPPED").length,
    failedCount: results.filter((row) => row.outcome === "FAILED").length,
    results,
  };
}

export async function importApprovedLearnersFromCsv(
  db: CsvImportPool,
  csvText: string
): Promise<CsvImportReport> {
  const preparedRows = parseApprovedLearnerCsv(csvText);
  const results: CsvImportRowResult[] = [];

  for (const row of preparedRows) {
    if (row.kind !== "ready") {
      results.push(emptyRowResult(row));
      continue;
    }

    let client: CsvImportClient | null = null;
    let transactionOpen = false;

    try {
      client = await db.connect();
      await client.query("BEGIN");
      transactionOpen = true;

      const imported = await ingestApprovedLearner(client, row.input);

      await client.query("COMMIT");
      transactionOpen = false;

      results.push({
        rowNumber: row.rowNumber,
        email: imported.email,
        externalSourceId: imported.source.externalSourceId,
        outcome: imported.action === "created" ? "CREATED" : "UPDATED",
        message: imported.action === "created" ? "Learner created" : "Learner updated",
        userId: imported.userId,
        studentNumber: imported.studentNumber,
        courseLinked: imported.courseLinked,
        warnings: imported.warnings,
      });
    } catch (e: any) {
      if (transactionOpen && client) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Keep the row failure isolated; the original row error is reported below.
        }
      }

      results.push({
        rowNumber: row.rowNumber,
        email: row.email,
        externalSourceId: row.externalSourceId,
        outcome: "FAILED",
        message: pgErrorMessage(e),
        userId: null,
        studentNumber: null,
        courseLinked: false,
        warnings: [],
      });
    } finally {
      client?.release();
    }
  }

  return buildReport(results);
}
