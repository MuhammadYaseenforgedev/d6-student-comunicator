# Local Demo Login

Use this workflow when you need local role access and realistic seeded data for UI work.

## Backend env

Use `backend/.env` for local development:

```env
NODE_ENV=development
APP_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/d6_dev
JWT_SECRET=dev_jwt_secret_123
JWT_EXPIRES_IN=1d
AUTH_REQUIRE_OTP=false
AUTH_ALLOW_PASSWORD_LOGIN=true
AUTH_ALLOW_PASSWORD_REGISTER=true
CORS_ORIGIN=http://localhost:5173
THREADS_MODE=D6
ALLOW_DEMO_OTP_BYPASS=false
```

Password-only login is intended for local development only. It still verifies the stored bcrypt password hash, so wrong passwords fail.

## Frontend env

Use `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:5000
VITE_API_TARGET=primary
VITE_DATA_MODE=api
VITE_BACKEND_PROXY_TARGET=http://localhost:5000
```

Never put secrets in frontend env variables. Values prefixed with `VITE_` are browser-visible.

## Setup

From `backend`:

```powershell
npm install
npm run seed:local
npm run dev
```

From `frontend`:

```powershell
npm install
npm run dev
```

## Demo accounts

All accounts use password `DemoPass123`.

| Role | Email | Extra login info |
| --- | --- | --- |
| Student | demo.student@d6.local | Student number `20231771` |
| Lecturer | demo.lecturer@d6.local | Assigned to CS101 |
| Parent | demo.parent@d6.local | Linked to `demo.student@d6.local` |
| Academic Admin | demo.academic.admin@d6.local | Admin scope `ACADEMIC` |
| Finance Admin | demo.finance.admin@d6.local | Admin scope `FINANCE` |
| Super Admin | demo.super.admin@d6.local | Admin scope `SUPER` |

The seed also creates a second student, `demo.student2@d6.local`, with student number `20231772`, so lecturer lists and parent-link approval screens have more than one learner state.

## Seeded data

The local seed creates:

- Course and module setup for Demo Computer Science / CS101.
- Lecturer module assignment and student enrollments.
- Parent-child link plus one pending link request.
- Attendance sessions and records.
- Module-scoped assessment results.
- Calendar entries and channel events.
- Announcements, channel messages, and direct message threads.
- Finance account, transactions, documents, and finance notifications.
- Lecturer and student upload records.
