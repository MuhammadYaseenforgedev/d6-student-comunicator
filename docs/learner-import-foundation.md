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

## Student numbers

Generated student numbers use the reusable format `STU-YYYY-NNNN` and are only assigned when a learner does not already have a `public_student_id`.

## Reuse later

Future CSV import, live Forge Talent sync, and onboarding flows should call the same approved learner intake service instead of creating separate learner-creation paths.
