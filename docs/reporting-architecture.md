# Reporting Architecture Base

This document captures the current backend reporting surface for Section 1 without introducing report tables or a reporting engine.

## Current Source Entities

- `attendance_sessions`, `attendance_records`, `attendance_checkins`
  - Attendance sessions, roster-level attendance marks, and check-in timing.
- `courses`, `faculty_modules`, `student_courses`, `student_module_enrollments`
  - Course ownership, module structure, active learner-course assignment, and learner-module availability.
- `student_profiles`, `users`
  - Learner onboarding completeness, identity/profile fields, and current course linkage.
- `support_tickets`
  - Support volume, status, category, assignee, and incorrect-details escalation data.
- `uploads`, `assessment_results`, `announcements`, `calendar_entries`
  - Supporting learner activity and academic delivery signals.
- Future connector inputs
  - `integration_configs` plus later LMS sync tables/events when introduced.

## What Can Be Reported Immediately

- Attendance reporting
  - Session counts by course/module/academic staff.
  - Attendance status totals by learner, module, and date range.
  - Check-in timeliness using `attendance_checkins` versus session start times.
- Course and module access reporting
  - Active learners per course from `student_courses`.
  - Learners with module access from `student_module_enrollments`.
  - Coverage gaps where a course is active but expected module links are missing.
- Ticket reporting
  - Ticket counts by `category`, `issue_type`, `status`, and date.
  - Incorrect-details ticket backlog and resolution throughput.
- Learner onboarding/import reporting
  - Profile completeness using `student_profiles.completed_at`.
  - Missing field trends using learner/profile joins.

## Aggregation Candidates

- Read-model SQL views or repository queries should be the first step.
- Favor additive reporting services over new storage until query cost or latency proves otherwise.
- Good first aggregates:
  - Attendance by module/date range.
  - Attendance by learner over time.
  - Ticket backlog by category/status.
  - Learner onboarding completeness by course.

## Known Gaps

- No dedicated historical snapshots for learner state changes.
- No LMS connector event tables yet, so future LMS reporting is limited to planning only.
- Progress reporting is currently indirect:
  - Results exist in `assessment_results`.
  - Uploads exist in `uploads`.
  - There is no consolidated progress summary table yet.

## Recommended Next Step

- Add reporting-specific repository/service functions that aggregate from current transactional tables.
- Keep those functions scoped by domain:
  - Attendance
  - Learner onboarding
  - Ticket operations
  - Course/module participation
- Introduce persisted aggregates only after production usage shows repeated heavy queries.

## Future Outputs

- Attendance dashboards by learner, academic staff, module, and course.
- Course/module progress summaries combining enrollments, results, and uploads.
- Ticket operations dashboards with incorrect-details workflows.
- Import/onboarding dashboards for incomplete learner records.
- LMS connector health and sync-volume reporting once LMS ingestion exists.
