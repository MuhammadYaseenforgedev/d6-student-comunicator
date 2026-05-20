# Executive Demo Runbook

## 1) Required Environment Variables

### Vercel (frontend project)
- `VITE_API_URL=https://d6-student-comunicator.onrender.com`
- `VITE_DATA_MODE=api`
- `VITE_ENABLE_DEMO_LOGIN=false`
- `VITE_API_TARGET=primary`
- `VITE_API_URL_SECONDARY=` unless intentionally using a secondary backend

### Render (backend service)
- `NODE_ENV=production`
- `APP_ENV=production`
- `DATABASE_URL=<neon-connection-string>`
- `JWT_SECRET=<strong-random-secret>`
- `CORS_ALLOW_ORIGINS=https://<your-vercel-production-domain>`
  - Multiple origins supported via comma-separated values.
  - `CORS_ORIGIN` is supported only as a legacy fallback.
  - `CORS_CREDENTIALS` is not an active runtime control.
- `THREADS_MODE=D6`
- `AUTH_REQUIRE_OTP=true`
- `AUTH_ALLOW_PASSWORD_LOGIN=false`
- `AUTH_ALLOW_PASSWORD_REGISTER=false`
- `AUTH_STAFF_REGISTER_PASSWORD=<staff-registration-password>`
- `ALLOW_DEMO_OTP_BYPASS=false`
- `DEMO_SEED_ENABLED=false` or absent after seeding is complete
- `SMTP_HOST=<smtp-hostname>`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=<smtp-username>`
- `SMTP_PASS=<smtp-password>`
- `SMTP_FROM=<verified-sender@your-domain>`
- WhatsApp outbound notification config, prepared for future use only:
  - `WHATSAPP_ENABLED=false`
  - `WHATSAPP_PROVIDER=none`
  - `WHATSAPP_DRY_RUN=true`
  - `WHATSAPP_DEFAULT_COUNTRY_CODE=ZA`
  - `WHATSAPP_ALLOWED_CATEGORIES=ANNOUNCEMENT,EMERGENCY,ATTENDANCE,PARENT_LINK`
  - `TWILIO_ACCOUNT_SID=`
  - `TWILIO_AUTH_TOKEN=`
  - `TWILIO_WHATSAPP_FROM=`
  - `TWILIO_MESSAGING_SERVICE_SID=`
  - `WHATSAPP_META_ACCESS_TOKEN=`
  - `WHATSAPP_META_PHONE_NUMBER_ID=`
  - `WHATSAPP_META_API_VERSION=`
- Preferred upload storage:
  - `SUPABASE_URL=<supabase-project-url>`
  - `SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>`
  - `SUPABASE_STORAGE_BUCKET=uploads`
- Fallback upload storage:
  - `UPLOAD_DIR=<absolute persistent mounted disk path>`

Production notes:
- `DEMO_MODE` and `DEMO_BYPASS_LOGIN` are not active production controls.
- `APP_ENV=production` forces OTP and disables password-only login/register shortcuts even if shortcut env vars are misconfigured.
- `ALLOW_DEMO_OTP_BYPASS` must remain `false` in production.
- WhatsApp must remain disabled/dry-run until outbound delivery, consent/opt-out handling, and provider template approval are implemented.

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

- Super Admin: `demo+admin@co.za` / `DemoPass123`
- Academic Admin: `demo+academic-admin@co.za` / `DemoPass123`
- Finance Admin: `demo+finance-admin@co.za` / `DemoPass123`
- Parent: `demo+parent@co.za` / `DemoPass123`
- Student: `demo+student1@replace-with-real-inbox.com` / `DemoPass123`
- Second Student/import onboarding learner: `demo+student2@replace-with-real-inbox.com` / `DemoPass123`
- Legacy Lecturer compatibility only: `demo+lecturer@co.za` / `DemoPass123`

Student login uses email, password, and the configured OTP policy. Student numbers such as `20231771` and `20231772` are internal/admin references only and should not be presented as login credentials.

If live OTP email delivery must be demonstrated, replace the seeded student placeholder inboxes with real accessible inboxes before demo day.

## 4) Demo-Day Smoke Checklist (10 minutes)

### Health + CORS
- `GET https://d6-student-comunicator.onrender.com/health` returns `200`.
- Browser preflight from Vercel succeeds for `Authorization` and `Content-Type` headers.

### OTP login behavior
- `POST /api/auth/request-otp` returns `200` when provider is configured.
- In production, response does not include `devOtp`.
- SMTP variables are required for usable OTP email delivery.
- Login OTP requests may intentionally return `200` with `emailDeliveryEnabled:false` if SMTP is unavailable, to avoid account enumeration.
- Check SMTP provider logs and backend logs for actual delivery issues.

### Role login checks
- Super Admin login returns `200` + token.
- Academic Admin login returns `200` + token.
- Finance Admin login returns `200` + token.
- Student login with email/password/OTP returns `200` + token.
- Parent login returns `200` + token.
- Legacy Lecturer login can be checked for compatibility only; it is not an active demo workflow.

### D6 messaging policy checks
- Parent -> Student thread create (`POST /api/threads`) returns `403`.
- Parent -> academic staff/admin thread create (`POST /api/threads`) returns `200/201`.

### Upload/download smoke (PowerShell)

Note:
- Files are preferably stored in private Supabase Storage. If Supabase Storage is not configured, files are stored on disk (`UPLOAD_DIR`) and must use a persistent mounted path in production.
- A blank/local `UPLOAD_DIR` on Render-style ephemeral disk is not durable.
- Files are served through protected route `GET /api/uploads/:id/download` (auth + role checks). There is no public unauthenticated static mount for uploads.

```powershell
$BaseUrl = "https://d6-student-comunicator.onrender.com"

# Login as Academic Admin
$academicBody = @{ email = "demo+academic-admin@co.za"; password = "DemoPass123"; otp = (Read-Host "Academic Admin OTP") } | ConvertTo-Json
$academicResp = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/auth/login" -ContentType "application/json" -Body $academicBody
$academicToken = $academicResp.token

# Upload academic material
$academicFile = Join-Path $env:TEMP "exec-academic-material.txt"
Set-Content -Path $academicFile -Value "Exec demo material" -Encoding UTF8
curl.exe -sS -X POST "$BaseUrl/api/uploads" `
  -H "Authorization: Bearer $academicToken" `
  -F "kind=LECTURER_MATERIAL" `
  -F "file=@$academicFile;type=text/plain"

# Login as student
$studentBody = @{
  email = "demo+student1@replace-with-real-inbox.com"
  password = "DemoPass123"
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
- Academic material upload: HTTP `201`.
- Student upload: HTTP `201`.
- Download request: HTTP `200` with file output.

### Data non-empty checks
- Parent results: `GET /api/parent/results?childId=20231771` returns `count >= 4`.
- Parent finance: `GET /api/parent/finance?childId=20231771` returns non-empty `documents`.
- Calendar endpoints for student/academic staff return seeded rows.
- Calendar ICS feed copy creates a signed private URL. Anyone with that URL can view the included calendar events; feed revocation is future work.

## 5) Send-to-Execs Template

Subject: D6 Student Communicator Executive Self-Test Access

Body:
- Frontend: `https://<your-vercel-production-domain>`
- Backend: `https://d6-student-comunicator.onrender.com`
- Sign in with the provided role credentials.
- OTP is required; request OTP in login, then complete sign-in.
- Known policy behavior: parent-to-student direct messaging is blocked by D6 policy.
