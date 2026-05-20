# Executive Demo Run Guide (Windows, Local Pilot)

## 1) Purpose
This guide starts a local, executive-shareable demo with:
1. Idempotent database migrations.
2. Idempotent demo seed/bootstrap.
3. Backend and frontend running with logs.
4. Parent approval workflow enabled for parent-child linking.

This is for local pilot/demo only.

Cloud hosting note:
1. Production should use private Supabase Storage when `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET` are configured.
2. If Supabase Storage is not configured, upload files are stored on local/container disk (`backend/uploads` by default, or `UPLOAD_DIR` when set).
3. On free hosting platforms with ephemeral storage, blank/local `UPLOAD_DIR` does not persist across restarts/redeploys.
4. Cloud production must use `APP_ENV=production`, `NODE_ENV=production`, `CORS_ALLOW_ORIGINS=<frontend-origin>`, `VITE_DATA_MODE=api`, and `VITE_ENABLE_DEMO_LOGIN=false`.

## 2) Prerequisites
1. Windows PowerShell 5+ (or PowerShell 7).
2. Node.js 20+ and npm.
3. PostgreSQL running locally and reachable from `backend/.env`.
4. `backend/.env` and `frontend/.env` present.

If missing, `scripts/RUN_DEMO_WINDOWS.ps1` auto-creates them from:
1. `backend/.env.example`
2. `frontend/.env.example`

## 3) One-Command Start
From repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/RUN_DEMO_WINDOWS.ps1
```

What this does:
1. Verifies env files.
2. Installs dependencies if `node_modules` is missing.
3. Runs backend migrations (`npm --prefix backend run migrate`).
4. Starts backend with local demo auth overrides (`AUTH_REQUIRE_OTP=false`, `AUTH_ALLOW_PASSWORD_LOGIN=true`, `AUTH_ALLOW_PASSWORD_REGISTER=true`) and waits for `/api/health`.
5. Runs idempotent seed/bootstrap (`scripts/demo-bootstrap.ps1`).
6. Starts frontend (`npm --prefix frontend run dev`).

Default URLs:
1. Backend: `http://localhost:4000`
2. Frontend: `http://localhost:5173`

Logs:
1. `logs/backend-*.log`
2. `logs/frontend-*.log`
3. `logs/run-demo-*.log`

## 4) Exec Demo Accounts and Roles
The exec demo seed (`npm --prefix backend run seed:exec-demo`) seeds these users with password:
1. `DemoPass123`

Accounts:
1. `demo+admin@co.za` (Super Admin)
2. `demo+academic-admin@co.za` (Academic Admin)
3. `demo+finance-admin@co.za` (Finance Admin)
4. `demo+parent@co.za` (Parent)
5. `demo+student1@replace-with-real-inbox.com` (Student)
6. `demo+student2@replace-with-real-inbox.com` (Second Student/import onboarding learner)
7. `demo+lecturer@co.za` (Legacy Lecturer compatibility only)

Student identities seeded for admin reference and parent linking:
1. `demo+student1@replace-with-real-inbox.com` -> internal student reference `20231771`, SA ID `0101015009087`
2. `demo+student2@replace-with-real-inbox.com` -> internal student reference `20231772`, SA ID `0101015009088`

Students log in with email, password, and the configured OTP policy. Student numbers are internal/admin references only and are not login credentials. Replace the seeded student placeholder inboxes with real accessible inboxes if live OTP email delivery must be demonstrated.

Staff self-registration password (env controlled):
1. `AUTH_STAFF_REGISTER_PASSWORD=staff_secret` (example default in `backend/.env.example`)

## 5) Executive Walkthrough (Role by Role)
1. Login as Super Admin.
2. Open `Parent Link Approvals` and verify pending/approved queue is visible.
3. Login as Parent, submit link request with student SA ID.
4. Return to Super Admin, approve request.
5. Login as Parent, confirm linked child appears and parent can view results/finance/calendar.
6. Login as Academic Admin, verify announcements, uploads, attendance, and results workflows.
7. Login as Finance Admin, verify finance account and document workflows.
8. Login as Student, verify email/password/OTP login and student-facing results, attendance, uploads, notifications, and calendar.
9. Open messaging from Parent to academic staff/admin and verify replies.
10. Treat Lecturer as legacy compatibility only, not an active executive workflow.

## 6) Stop Demo
From repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/STOP_DEMO_WINDOWS.ps1
```

This stops managed backend/frontend processes using PID files in `logs/`.

## 7) Validation Commands
Run these from repo root:

```powershell
npm --prefix backend run test
npm --prefix backend run test:walkthrough
npm --prefix frontend run build
```

## 8) Troubleshooting
1. Backend not healthy:
`Get-Content logs/backend-*.log -Tail 80`

2. Frontend not loading:
`Get-Content logs/frontend-*.log -Tail 80`

3. Migration failure:
`npm --prefix backend run migrate`

4. Reseed only:
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/demo-bootstrap.ps1 -BaseUrl http://localhost:4000`

If you run `scripts/demo-bootstrap.ps1` directly against a backend that was not started by `RUN_DEMO_WINDOWS.ps1`, make sure an admin already exists or start the backend with local demo auth overrides first.
