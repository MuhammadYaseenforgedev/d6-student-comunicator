# Demo Smoke Checklist

Use the seeded demo accounts and verify these flows after deploy.

## Demo Accounts

1. Super Admin: `demo+admin@co.za` / `DemoPass123`
2. Academic Admin: `demo+academic-admin@co.za` / `DemoPass123`
3. Finance Admin: `demo+finance-admin@co.za` / `DemoPass123`
4. Parent: `demo+parent@co.za` / `DemoPass123`
5. Student: `demo+student1@replace-with-real-inbox.com` / `DemoPass123`
6. Second Student/import onboarding learner: `demo+student2@replace-with-real-inbox.com` / `DemoPass123`
7. Legacy Lecturer compatibility only: `demo+lecturer@co.za` / `DemoPass123`

Students log in with email, password, and the configured OTP policy. Student numbers are internal/admin references only, not login credentials. Replace the seeded student placeholder inboxes with real accessible inboxes if live OTP email delivery must be demonstrated.

## Authentication

1. Super Admin login with correct credentials succeeds.
2. Academic Admin login with correct credentials succeeds.
3. Finance Admin login with correct credentials succeeds.
4. Student login with email/password/OTP succeeds.
5. Parent login with correct credentials succeeds.
6. Wrong password is rejected with an auth error.
7. In production (`APP_ENV=production`), OTP is required and password-only login is blocked even if shortcut env vars are misconfigured.
8. In non-production only, password-only login can be explicitly enabled with `AUTH_ALLOW_PASSWORD_LOGIN=true`.
9. If SMTP is unavailable, login OTP requests may return `200` with `emailDeliveryEnabled:false`; check SMTP provider logs and backend logs for delivery issues.
10. Legacy Lecturer login is optional compatibility coverage only, not an active client demo workflow.

## RBAC

1. Student cannot access admin finance or account-management routes.
2. Parent can view parent portal pages but cannot access academic admin attendance actions.
3. Academic Admin can manage attendance and results.
4. Finance Admin can access finance workflows but not academic admin workflows.
5. Super Admin can manage finance, accounts, attendance, and parent-link approvals.

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

1. Academic Admin can load attendance modules and sessions.
2. Academic Admin can open a roster and mark attendance.
3. Student can open attendance and see their own records.

## Parent Linking

1. Parent sees an approved linked child.
2. Admin sees a pending parent-link request in approvals.

## Cleanliness

1. No raw OTP values appear in logs.
2. No startup `DB_DEBUG` diagnostics appear.
3. No visible debug panels appear on login or parent finance pages.
