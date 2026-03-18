# Executive Demo Run Guide (Windows, Local Pilot)

## 1) Purpose
This guide starts a local, executive-shareable demo with:
1. Idempotent database migrations.
2. Idempotent demo seed/bootstrap.
3. Backend and frontend running with logs.
4. Parent approval workflow enabled for parent-child linking.

This is for local pilot/demo only.

Cloud hosting note:
1. Upload files are stored on local/container disk (`backend/uploads` by default).
2. On free hosting platforms with ephemeral storage, uploaded files do not persist across restarts/redeploys.

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
4. Starts backend with local demo auth overrides (`AUTH_REQUIRE_OTP=false`, `AUTH_ALLOW_PASSWORD_REGISTER=true`) and waits for `/api/health`.
5. Runs idempotent seed/bootstrap (`scripts/demo-bootstrap.ps1`).
6. Starts frontend (`npm --prefix frontend run dev`).

Default URLs:
1. Backend: `http://localhost:4000`
2. Frontend: `http://localhost:5173`

Logs:
1. `logs/backend-*.log`
2. `logs/frontend-*.log`
3. `logs/run-demo-*.log`

## 4) Demo Accounts and Roles
The bootstrap seeds demo users with password:
1. `D6Demo!2026`

Emails:
1. `admin_demo@local.test` (ADMIN)
2. `lecturer_demo@local.test` (LECTURER)
3. `student_demo@local.test` (STUDENT, requires student number at login)
4. `student_demo2@local.test` (STUDENT, requires student number at login)
5. `parent_demo@local.test` (PARENT)

Student identities seeded for linking/login:
1. `student_demo@local.test` -> student number `STU-DEMO-1001`, SA ID `9001015009087`
2. `student_demo2@local.test` -> student number `STU-DEMO-1002`, SA ID `9001015009088`

Staff self-registration password (env controlled):
1. `AUTH_STAFF_REGISTER_PASSWORD=staff_secret` (example default in `backend/.env.example`)

## 5) Executive Walkthrough (Role by Role)
1. Login as `ADMIN`.
2. Open `Parent Link Approvals` and verify pending/approved queue is visible.
3. Login as `PARENT`, submit link request with student SA ID.
4. Return to `ADMIN`, approve request.
5. Login as `PARENT`, confirm linked child appears and parent can view results/finance/calendar.
6. Login as `LECTURER`, verify announcements and uploads management.
7. Login as `STUDENT`, verify student login requires student number plus email/password.
8. Open messaging from `PARENT` to `LECTURER` and verify replies.

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
