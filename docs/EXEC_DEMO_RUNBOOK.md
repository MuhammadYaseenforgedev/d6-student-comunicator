# Executive Demo Runbook

## 1) Required Environment

### Render (backend)
- `AUTH_REQUIRE_OTP=false`
- `AUTH_ALLOW_PASSWORD_LOGIN=true`
- `AUTH_ALLOW_PASSWORD_REGISTER=false`
- `THREADS_MODE=D6`
- `CORS_ORIGIN=https://<your-vercel-production-domain>`
  - If multiple origins are required, use comma-separated values.

### Vercel (frontend)
- `VITE_API_URL=https://d6-student-comunicator.onrender.com`
- `VITE_DATA_MODE=api`

## 2) Deploy and Seed

From repo root:

```bash
cd backend
npm install
npm run migrate
npm run seed:exec-demo
```

Frontend deploy notes:
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Ensure `frontend/vercel.json` SPA rewrite is present.

## 3) Demo Credentials

- Admin
  - Email: `admin.exec.demo@d6demo.co.za`
  - Password: `D6ExecAdmin!2026`
- Lecturer
  - Email: `lecturer.exec.demo@d6demo.co.za`
  - Password: `D6ExecLecturer!2026`
- Student
  - Email: `student.exec.demo@d6demo.co.za`
  - Password: `D6ExecStudent!2026`
  - Student Number: `STU-EXEC-1001`
- Parent
  - Email: `parent.exec.demo@d6demo.co.za`
  - Password: `D6ExecParent!2026`

## 4) 10-Minute Smoke Checklist

### Backend health
- `GET /health` -> `200`

### Login checks
- Admin login -> `200` token
- Lecturer login -> `200` token
- Student login with `studentNumber=STU-EXEC-1001` -> `200` token
- Parent login -> `200` token

### Messaging policy checks (D6)
- Parent -> Student thread create (`POST /api/threads`) -> `403 FORBIDDEN`
- Parent -> Lecturer thread create (`POST /api/threads`) -> `200/201`

### Data non-empty checks
- Parent results (`/api/parent/parent/results?childId=STU-EXEC-1001`) -> `count >= 4`
- Parent finance (`/api/parent/parent/finance?childId=STU-EXEC-1001`) -> `documents.length >= 2`, `statements >= 2`
- Student calendar (`/api/calendar`) -> at least 2 entries
- Lecturer calendar (`/api/calendar`) -> at least 2 entries
- Uploads (`/api/uploads`) -> lecturer material(s) + student submission visible by role rules

### Frontend checks
- Vercel URL loads
- Sign-in works without OTP when backend policy allows password-only login
- 401/403/429 errors show friendly UI messages on login

## 5) Send-to-Execs Template

Subject: D6 Student Communicator Executive Self-Test Access

Body:
- Test URL: `https://<your-vercel-production-domain>`
- Backend: `https://d6-student-comunicator.onrender.com`
- Credentials:
  - Admin: `admin.exec.demo@d6demo.co.za` / `D6ExecAdmin!2026`
  - Lecturer: `lecturer.exec.demo@d6demo.co.za` / `D6ExecLecturer!2026`
  - Student: `student.exec.demo@d6demo.co.za` / `D6ExecStudent!2026` (Student Number: `STU-EXEC-1001`)
  - Parent: `parent.exec.demo@d6demo.co.za` / `D6ExecParent!2026`
- Notes:
  - Parent-to-student direct messaging is intentionally blocked by D6 policy.
  - First Render request may be slow if the service was sleeping.

