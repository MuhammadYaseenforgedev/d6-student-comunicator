# Executive Demo Runbook

## 1) Required Environment Variables

### Vercel (frontend project)
- `VITE_API_URL=https://d6-student-comunicator.onrender.com`

### Render (backend service)
- `NODE_ENV=production`
- `APP_ENV=production`
- `DATABASE_URL=<neon-connection-string>`
- `JWT_SECRET=<strong-random-secret>`
- `CORS_ORIGIN=https://<your-vercel-production-domain>`
  - Multiple origins supported via comma-separated values.
- `THREADS_MODE=D6`
- `AUTH_REQUIRE_OTP=true`
- `AUTH_ALLOW_PASSWORD_LOGIN=false`
- `AUTH_ALLOW_PASSWORD_REGISTER=false`
- `AUTH_STAFF_REGISTER_PASSWORD=<staff-registration-password>`
- `ALLOW_DEMO_OTP_BYPASS=false`
- `OTP_EMAIL_PROVIDER=resend`
- `RESEND_API_KEY=<resend-api-key>`
- `OTP_EMAIL_FROM=<verified-sender@your-domain>`
- `OTP_EMAIL_REPLY_TO=<optional-reply-to@your-domain>`

## 2) Deploy + Seed

From repo root:

```bash
npm install
npm --prefix backend run migrate
npm --prefix backend run seed:exec-demo
```

Frontend deploy settings:
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`

## 3) Demo Accounts

- Admin: `admin.exec.demo@d6demo.co.za` / `D6ExecAdmin!2026`
- Lecturer: `lecturer.exec.demo@d6demo.co.za` / `D6ExecLecturer!2026`
- Student: `student.exec.demo@d6demo.co.za` / `D6ExecStudent!2026` / student number `STU-EXEC-1001`
- Parent: `parent.exec.demo@d6demo.co.za` / `D6ExecParent!2026`

## 4) Demo-Day Smoke Checklist (10 minutes)

### Health + CORS
- `GET https://d6-student-comunicator.onrender.com/health` returns `200`.
- Browser preflight from Vercel succeeds for `Authorization` and `Content-Type` headers.

### OTP login behavior
- `POST /api/auth/request-otp` returns `200` when provider is configured.
- In production, response does not include `devOtp`.
- If provider keys are missing, `/api/auth/request-otp` returns `503` with `Email provider not configured`.

### Role login checks
- Admin login returns `200` + token.
- Lecturer login returns `200` + token.
- Student login (`studentNumber=STU-EXEC-1001`) returns `200` + token.
- Parent login returns `200` + token.

### D6 messaging policy checks
- Parent -> Student thread create (`POST /api/threads`) returns `403`.
- Parent -> Lecturer thread create (`POST /api/threads`) returns `200/201`.

### Upload/download smoke (PowerShell)

Note:
- Files are stored on disk (`UPLOAD_DIR`) and served through protected route `GET /api/uploads/:id/download` (auth + role checks). There is no public unauthenticated static mount for uploads.

```powershell
$BaseUrl = "https://d6-student-comunicator.onrender.com"

# Login as lecturer
$lecturerBody = @{ email = "lecturer.exec.demo@d6demo.co.za"; password = "D6ExecLecturer!2026"; otp = (Read-Host "Lecturer OTP") } | ConvertTo-Json
$lecturerResp = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/auth/login" -ContentType "application/json" -Body $lecturerBody
$lecturerToken = $lecturerResp.token

# Upload lecturer material
$lecturerFile = Join-Path $env:TEMP "exec-lecturer-material.txt"
Set-Content -Path $lecturerFile -Value "Exec demo material" -Encoding UTF8
curl.exe -sS -X POST "$BaseUrl/api/uploads" `
  -H "Authorization: Bearer $lecturerToken" `
  -F "kind=LECTURER_MATERIAL" `
  -F "file=@$lecturerFile;type=text/plain"

# Login as student
$studentBody = @{
  email = "student.exec.demo@d6demo.co.za"
  password = "D6ExecStudent!2026"
  studentNumber = "STU-EXEC-1001"
  otp = (Read-Host "Student OTP")
} | ConvertTo-Json
$studentResp = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/auth/login" -ContentType "application/json" -Body $studentBody
$studentToken = $studentResp.token

# Upload student submission
$studentFile = Join-Path $env:TEMP "exec-student-submission.txt"
Set-Content -Path $studentFile -Value "Exec demo submission" -Encoding UTF8
curl.exe -sS -X POST "$BaseUrl/api/uploads" `
  -H "Authorization: Bearer $studentToken" `
  -F "kind=STUDENT_SUBMISSION" `
  -F "file=@$studentFile;type=text/plain"

# Download first visible upload as student
$uploads = Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/uploads" -Headers @{ Authorization = "Bearer $studentToken" }
$firstId = $uploads.value[0].id
curl.exe -sS -L -X GET "$BaseUrl/api/uploads/$firstId/download" -H "Authorization: Bearer $studentToken" -o "$env:TEMP\exec-download.bin"
```

Expected outcomes:
- Lecturer upload: HTTP `201`.
- Student upload: HTTP `201`.
- Download request: HTTP `200` with file output.

### Data non-empty checks
- Parent results: `GET /api/parent/parent/results?childId=STU-EXEC-1001` returns `count >= 4`.
- Parent finance: `GET /api/parent/parent/finance?childId=STU-EXEC-1001` returns non-empty `documents`.
- Calendar endpoints for student/lecturer return seeded rows.

## 5) Send-to-Execs Template

Subject: D6 Student Communicator Executive Self-Test Access

Body:
- Frontend: `https://<your-vercel-production-domain>`
- Backend: `https://d6-student-comunicator.onrender.com`
- Sign in with the provided role credentials.
- OTP is required; request OTP in login, then complete sign-in.
- Known policy behavior: parent-to-student direct messaging is blocked by D6 policy.
