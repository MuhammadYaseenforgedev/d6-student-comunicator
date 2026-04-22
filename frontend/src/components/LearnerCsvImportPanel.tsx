import { useMemo, useRef, useState } from "react";
import {
  importApprovedLearnersCsv,
  type LearnerCsvImportResponse,
  type LearnerCsvImportResult,
} from "../lib/learnerImportApi";

type PreviewRow = {
  rowNumber: number;
  values: string[];
  issue: string | null;
};

const MAX_PREVIEW_ROWS = 8;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const REQUIRED_HEADERS = ["email"];

function prettySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell.trim());
  return cells;
}

function getResultStatus(result: LearnerCsvImportResult): string {
  return String(result.status ?? result.action ?? "").trim().toUpperCase() || "REPORTED";
}

function getResultMessage(result: LearnerCsvImportResult): string {
  if (Array.isArray(result.errors) && result.errors.length) return result.errors.join(", ");
  return String(result.message ?? result.error ?? "").trim() || "Processed by backend import rules.";
}

export default function LearnerCsvImportPanel({
  onImported,
}: {
  onImported?: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<LearnerCsvImportResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const malformedCount = useMemo(
    () => previewRows.filter((row) => row.issue).length,
    [previewRows]
  );
  const canUpload = Boolean(file) && !validationError && !loadingPreview && !uploading;

  async function validateFile(nextFile: File | null) {
    setFile(nextFile);
    setHeaders([]);
    setPreviewRows([]);
    setValidationError(null);
    setUploadError(null);
    setResult(null);

    if (!nextFile) return;

    const isCsv =
      nextFile.name.toLowerCase().endsWith(".csv") ||
      nextFile.type === "text/csv" ||
      nextFile.type === "application/csv";

    if (!isCsv) {
      setValidationError("Choose a supported CSV file.");
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE_BYTES) {
      setValidationError(`CSV must be ${prettySize(MAX_FILE_SIZE_BYTES)} or smaller.`);
      return;
    }

    try {
      setLoadingPreview(true);
      const text = await nextFile.text();
      const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());

      if (lines.length < 2) {
        setValidationError("CSV needs a header row and at least one learner row.");
        return;
      }

      const parsedHeaders = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
      const missingHeaders = REQUIRED_HEADERS.filter(
        (header) => !parsedHeaders.includes(header)
      );

      setHeaders(parsedHeaders);
      if (missingHeaders.length) {
        setValidationError(`Missing required header: ${missingHeaders.join(", ")}.`);
      }

      const emailIndex = parsedHeaders.indexOf("email");
      setPreviewRows(
        lines.slice(1, MAX_PREVIEW_ROWS + 1).map((line, index) => {
          const values = parseCsvLine(line);
          const email = emailIndex >= 0 ? values[emailIndex] ?? "" : "";
          const issue =
            values.length !== parsedHeaders.length
              ? "Column count does not match header"
              : email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                ? null
                : "Email is missing or malformed";
          return { rowNumber: index + 2, values, issue };
        })
      );
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : "Failed to read CSV preview.");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function uploadCsv() {
    if (!file || !canUpload) return;

    try {
      setUploading(true);
      setUploadError(null);
      const response = await importApprovedLearnersCsv(file);
      setResult(response);
      await onImported?.();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "CSV upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="teal-glow-card space-y-5 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-lg font-semibold text-white">Student CSV Import</div>
          <div className="mt-1 text-sm leading-6 text-white/72">
            Import approved learners with backend validation. Review the local preview before confirming the upload.
          </div>
        </div>
        <span className="rounded-full border border-[rgba(140,235,255,0.22)] bg-[rgba(8,18,48,0.58)] px-3 py-1 text-xs font-semibold text-[#8CEBFF]">
          Academic admin only
        </span>
      </div>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void validateFile(event.dataTransfer.files?.[0] ?? null);
        }}
        className="rounded-3xl border border-dashed border-[rgba(140,235,255,0.30)] bg-[rgba(8,18,48,0.52)] p-5"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,application/csv"
          className="sr-only"
          onChange={(event) => void validateFile(event.target.files?.[0] ?? null)}
          aria-label="Choose learner CSV file"
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold text-white">
              {file ? file.name : "Choose or drop a CSV file"}
            </div>
            <div className="mt-1 text-sm text-white/64">
              {file ? `${prettySize(file.size)} | ${validationError ? "Needs attention" : "Ready to preview"}` : "Supported format: .csv"}
            </div>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary">
            Browse file
          </button>
        </div>
      </div>

      {loadingPreview ? <div className="info-banner">Validating CSV preview...</div> : null}
      {validationError ? <div className="error-banner">{validationError}</div> : null}
      {uploadError ? <div className="error-banner">{uploadError}</div> : null}

      {!file ? (
        <div className="info-banner">No file selected yet. Choose a CSV to validate headers and preview learner rows.</div>
      ) : previewRows.length > 0 ? (
        <div className="mobile-table-shell overflow-auto rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.54)]">
          <table className="min-w-[46rem] text-sm">
            <thead className="bg-[rgba(140,235,255,0.08)] text-white/84">
              <tr>
                <th className="px-3 py-2 text-left">Row</th>
                {headers.slice(0, 6).map((header) => (
                  <th key={header} className="px-3 py-2 text-left">{header}</th>
                ))}
                <th className="px-3 py-2 text-left">Validation</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr key={row.rowNumber} className="border-t border-[rgba(140,235,255,0.12)]">
                  <td className="px-3 py-2 text-white/72">{row.rowNumber}</td>
                  {headers.slice(0, 6).map((header, index) => (
                    <td key={`${row.rowNumber}-${header}`} className="px-3 py-2 text-white">
                      {row.values[index] || "—"}
                    </td>
                  ))}
                  <td className={["px-3 py-2", row.issue ? "text-amber-200" : "text-emerald-200"].join(" ")}>
                    {row.issue ?? "Looks valid"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {malformedCount > 0 ? (
        <div className="rounded-2xl border border-[rgba(255,196,87,0.24)] bg-[rgba(97,59,9,0.45)] p-3 text-sm text-[#ffe8b0]">
          {malformedCount} preview row(s) may fail backend validation. You can still submit if the backend schema accepts them.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void uploadCsv()} disabled={!canUpload} className="btn-primary disabled:opacity-60">
          {uploading ? "Uploading..." : "Upload approved learners"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            void validateFile(null);
          }}
          disabled={uploading || !file}
          className="btn-secondary disabled:opacity-60"
        >
          Clear
        </button>
      </div>

      {result ? (
        <div className="space-y-3">
          <div className="info-banner">
            Import complete: {result.summary.createdCount} created, {result.summary.updatedCount} updated, {result.summary.skippedCount} skipped, {result.summary.failedCount} failed.
          </div>
          {result.results.length > 0 ? (
            <div className="max-h-72 overflow-auto rounded-2xl border border-[rgba(140,235,255,0.18)] bg-[rgba(8,18,48,0.54)]">
              {result.results.slice(0, 20).map((row, index) => (
                <div key={`${row.email ?? "row"}-${index}`} className="border-b border-[rgba(140,235,255,0.10)] px-4 py-3 text-sm last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">Row {row.rowNumber ?? row.row ?? index + 1}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">{getResultStatus(row)}</span>
                    {row.email ? <span className="text-white/70">{row.email}</span> : null}
                  </div>
                  <div className="mt-1 text-xs text-white/62">{getResultMessage(row)}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
