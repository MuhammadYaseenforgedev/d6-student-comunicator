# Learner Import Foundation

Section 2A adds a backend-only foundation for approved learner intake without introducing a live Forge Talent dependency yet.

## Trusted source model

Trusted learner import state is stored on `student_profiles` so legacy/manual learners keep working unchanged:

- `verified_from_talent boolean`
- `external_source text`
- `external_source_id text`
- `locked_fields jsonb`
- `source_metadata jsonb`

This keeps the existing `users` identity model intact while giving the backend a reusable place to mark imported learner records and the fields that should be treated as trusted later.

## Reusable pipeline

The shared intake flow is:

1. Validate an approved-learner style payload.
2. Match an existing learner by `external_source_id`, then email, then national ID.
3. Create or update the `STUDENT` user conservatively.
4. Ensure a generated `public_student_id` exists.
5. Upsert trusted-source metadata onto `student_profiles`.
6. Reuse the existing course assignment helper when a valid course reference is supplied.

The current admin-only trigger is `POST /api/admin/imports/approved-learner`.

CSV bulk import uses the same pipeline through `POST /api/admin/imports/approved-learners/csv`.

## Student numbers

Generated student numbers use the reusable format `STU-YYYY-NNNN` and are only assigned when a learner does not already have a `public_student_id`.

## Reuse later

Future CSV import, live Forge Talent sync, and onboarding flows should call the same approved learner intake service instead of creating separate learner-creation paths.

## CSV bulk import

The CSV importer accepts a multipart `file` upload or a `csv` text body. Files are processed in memory and are not stored permanently.

Required columns:

- `first_name`
- `last_name`
- `email`
- `external_source_id`

Optional supported columns:

- `phone`
- `id_number`
- `course_id`
- `course_code`
- `external_source`
- `metadata_json`

Normalization and validation:

- Headers are lowercased and spaces/hyphens become underscores.
- Whitespace is trimmed from all cells.
- Empty optional cells become `null`.
- `email` must look like an email address.
- `course_id`, when provided, must be a UUID.
- `external_source` defaults to `FORGE_TALENT_CSV` and must contain only letters, numbers, underscores, or hyphens.
- `metadata_json`, when provided, must parse to a JSON object.

Batch results include summary totals plus per-row outcomes: `CREATED`, `UPDATED`, `SKIPPED`, or `FAILED`. Row results include row number, email/source ID, learner ID, student number, course-link status, warnings, and a safe message.
