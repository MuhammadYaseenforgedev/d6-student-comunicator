# Cloud Deploy Guide (Render + Vercel + Neon)

This guide keeps the current architecture and business logic unchanged and deploys:

1. Backend: Render (Web Service)
2. Database: Neon (Postgres)
3. Frontend: Vercel (static SPA)

## 1) Create Neon Postgres

1. Create a Neon project and database.
2. Copy the pooled connection string (`postgres://...`) from Neon.
3. Keep this as `DATABASE_URL` for Render backend.

Notes:
1. Neon typically requires SSL; use the Neon-provided URL as-is.
2. You do not need to fill `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` if `DATABASE_URL` is set.

## 2) Deploy Backend on Render

Create a Render Web Service from this repo and set:

1. Build Command:
```bash
npm install --prefix backend && npm --prefix backend run build
```
2. Start Command:
```bash
npm --prefix backend run migrate && npm --prefix backend run start
```

Set backend environment variables (Render -> Environment):

```env
NODE_ENV=production
APP_ENV=production
PORT=4000

DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require

JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=7d

AUTH_REQUIRE_OTP=true
AUTH_ALLOW_PASSWORD_LOGIN=false
AUTH_ALLOW_PASSWORD_REGISTER=false
AUTH_STAFF_REGISTER_PASSWORD=staff_secret

SMTP_HOST=<smtp-hostname>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-username>
SMTP_PASS=<smtp-password>
SMTP_FROM=<verified-sender@your-domain>

THREADS_MODE=D6
ALLOW_DEMO_OTP_BYPASS=false
DEMO_SEED_ENABLED=false
OTP_TTL_MINUTES=10
OTP_MAX_ATTEMPTS=5
OTP_EMAIL_WINDOW_MINUTES=10
OTP_EMAIL_MAX_PER_WINDOW=5
OTP_IP_WINDOW_MINUTES=10
OTP_IP_MAX_PER_WINDOW=25

# Comma-separated allowlist (no spaces required)
CORS_ALLOW_ORIGINS=https://<your-vercel-app>.vercel.app,https://<your-custom-frontend-domain>

# Preferred persistent upload storage
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
SUPABASE_STORAGE_BUCKET=uploads

# Fallback only when using a persistent mounted disk instead of Supabase Storage
UPLOAD_DIR=
```

Notes:
1. `CORS_ORIGIN` remains supported by the backend as a legacy fallback, but production docs should use `CORS_ALLOW_ORIGINS`.
2. `CORS_CREDENTIALS` is not an active runtime control in this app; the backend does not use credentialed CORS.
3. `DEMO_MODE` and `DEMO_BYPASS_LOGIN` are not active production controls. Keep `APP_ENV=production`, `NODE_ENV=production`, `ALLOW_DEMO_OTP_BYPASS=false`, and `DEMO_SEED_ENABLED=false` or unset.
4. In `APP_ENV=production`, the backend forces OTP and disables password-only login/register shortcuts even if shortcut env vars are accidentally set.

## 3) Deploy Frontend on Vercel

Create a Vercel project from this repo.

Recommended settings:
1. Root Directory: `frontend`
2. Build Command: `npm run build`
3. Output Directory: `dist`

Set frontend environment variables (Vercel -> Environment Variables):

```env
VITE_API_URL=https://<your-render-backend>.onrender.com
VITE_API_BASE_URL=
VITE_DATA_MODE=api
VITE_ENABLE_DEMO_LOGIN=false
VITE_API_TARGET=primary
VITE_API_URL_SECONDARY=
```

Production notes:
1. `VITE_API_URL` must point to the Render backend, not `localhost`.
2. Keep `VITE_DATA_MODE=api`; `mock`/`demo` modes use local frontend demo data.
3. Keep `VITE_ENABLE_DEMO_LOGIN=false`; local demo login is only for mock/demo frontend data modes.

SPA routing:
1. This repo includes `vercel.json` rewrite to route all frontend paths to `index.html`.
2. If Vercel root-directory settings ignore root-level config, mirror the same rewrite rule in Vercel project settings.

## 4) CORS Allowlist Example

Use exact frontend origins in `CORS_ALLOW_ORIGINS`:

```env
CORS_ALLOW_ORIGINS=https://d6-communicator.vercel.app,https://demo.yourdomain.com
```

The backend accepts a comma-separated list and trims entries automatically. `CORS_ORIGIN` is still accepted as a legacy fallback, but prefer `CORS_ALLOW_ORIGINS` for all production setups.

## 5) Upload Persistence

Preferred production upload storage is Supabase Storage. Files are still served through protected backend download routes; do not expose the bucket publicly for app access.

Recommended production setup:

1. Create a private Supabase Storage bucket.
2. Set:
```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
SUPABASE_STORAGE_BUCKET=uploads
```

Fallback production setup:

1. Create or mount a persistent directory on the backend host, for example:
   1. `/var/lib/d6/uploads`
   2. `/mnt/d6-uploads`
2. Give the backend process read/write access to that directory.
3. Set:
```env
UPLOAD_DIR=/var/lib/d6/uploads
```

If Supabase Storage is not configured and you leave `UPLOAD_DIR` blank, the app falls back to `backend/uploads` inside the app filesystem:

1. Uploaded files can be lost on restart/redeploy on ephemeral hosts.
2. Metadata in Postgres may remain while file blobs disappear.

The current app now prunes broken upload metadata when files are missing, but that is cleanup protection, not durable storage.

## 6) OTP Email Delivery

SMTP is required for usable production OTP delivery:

```env
SMTP_HOST=<smtp-hostname>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-username>
SMTP_PASS=<smtp-password>
SMTP_FROM=<verified-sender@your-domain>
```

Production login OTP requests may intentionally return `200` with `emailDeliveryEnabled:false` if SMTP is unavailable, to avoid account enumeration. Operators must check SMTP provider logs and backend logs for actual delivery failures.

## 7) Calendar ICS Feeds

Calendar subscription feeds use signed private URLs. Anyone with a feed URL can view the calendar events included by that user's current feed scope. Feed revocation is not implemented yet and should be treated as future work.

## 8) After URLs Go Live

After first successful deploy:

1. Update backend `CORS_ALLOW_ORIGINS` with the final Vercel domain(s).
2. Update frontend `VITE_API_URL` to the final Render backend URL.
3. Redeploy backend and frontend.
4. Verify:
   1. `GET /api/health` from backend URL.
   2. Login/register flow from frontend.
   3. Role-restricted routes.
   4. File upload/download behavior.
   5. Restart the backend once and confirm previously uploaded files still download.
