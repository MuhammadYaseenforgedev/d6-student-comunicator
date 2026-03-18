# Demo Smoke Checklist

Use the seeded demo accounts and verify these flows after deploy.

## Authentication

1. Admin login with correct credentials succeeds.
2. Lecturer login with correct credentials succeeds.
3. Student login with correct credentials and student number succeeds.
4. Parent login with correct credentials succeeds.
5. Wrong password is rejected with an auth error.
6. If OTP is required in this environment, password-only login is blocked unless `AUTH_ALLOW_PASSWORD_LOGIN=true`.

## RBAC

1. Student cannot access admin finance or account-management routes.
2. Parent can view parent portal pages but cannot access lecturer/admin attendance actions.
3. Lecturer can manage attendance and results.
4. Admin can manage finance, accounts, attendance, and parent-link approvals.

## Demo Data Visibility

1. Dashboard home page shows General channel content.
2. Modules, Faculty, Clubs, and Emergency pages each load seeded announcements/events.
3. Student sees at least one attendance module/session.
4. Student results page shows published results.
5. Parent overview shows one linked child and recent link-request history.
6. Parent results page shows the linked child’s results.
7. Parent finance page shows balance, status note, documents, and notifications.
8. Calendar page shows at least one event or entry for the demo role.
9. Messages/threads page shows at least one conversation.
10. Uploads page shows seeded content.

## Finance

1. Admin finance page lists the seeded student account.
2. Admin can open the finance account detail.
3. Finance statement download works.
4. Parent can download the linked child’s finance statement.

## Attendance

1. Lecturer/admin can load attendance modules and sessions.
2. Lecturer/admin can open a roster and mark attendance.
3. Student can open attendance and see their own records.

## Parent Linking

1. Parent sees an approved linked child.
2. Admin sees a pending parent-link request in approvals.

## Cleanliness

1. No raw OTP values appear in logs.
2. No startup `DB_DEBUG` diagnostics appear.
3. No visible debug panels appear on login or parent finance pages.
