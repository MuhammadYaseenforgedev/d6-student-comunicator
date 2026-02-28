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
PORT=4000

DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require

JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=7d

AUTH_REQUIRE_OTP=true
AUTH_ALLOW_PASSWORD_LOGIN=false
AUTH_ALLOW_PASSWORD_REGISTER=false
AUTH_STAFF_REGISTER_PASSWORD=staff_secret

THREADS_MODE=D6
OTP_RETURN_DEV_CODE=false
OTP_TTL_MINUTES=10
OTP_MAX_ATTEMPTS=5
OTP_EMAIL_WINDOW_MINUTES=10
OTP_EMAIL_MAX_PER_WINDOW=5
OTP_IP_WINDOW_MINUTES=10
OTP_IP_MAX_PER_WINDOW=25

# Comma-separated allowlist (no spaces required)
CORS_ORIGIN=https://<your-vercel-app>.vercel.app,https://<your-custom-frontend-domain>

# Optional upload location override inside container
UPLOAD_DIR=backend/uploads
```

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
```

SPA routing:
1. This repo includes `vercel.json` rewrite to route all frontend paths to `index.html`.
2. If Vercel root-directory settings ignore root-level config, mirror the same rewrite rule in Vercel project settings.

## 4) CORS Allowlist Example

Use exact frontend origins in `CORS_ORIGIN`:

```env
CORS_ORIGIN=https://d6-communicator.vercel.app,https://demo.yourdomain.com
```

The backend accepts a comma-separated list and trims entries automatically.

## 5) Upload Persistence Warning (Free Hosts)

Current upload storage is filesystem-based (`backend/uploads` by default). On free hosts, container files are ephemeral:

1. Uploaded files can be lost on restart/redeploy.
2. Metadata in Postgres may remain while file blobs disappear.

For production persistence, switch uploads to object storage (for example S3-compatible storage) and keep DB metadata as-is.

## 6) After URLs Go Live

After first successful deploy:

1. Update backend `CORS_ORIGIN` with the final Vercel domain(s).
2. Update frontend `VITE_API_URL` to the final Render backend URL.
3. Redeploy backend and frontend.
4. Verify:
   1. `GET /api/health` from backend URL.
   2. Login/register flow from frontend.
   3. Role-restricted routes.
   4. File upload/download behavior (with ephemeral-storage expectation).
