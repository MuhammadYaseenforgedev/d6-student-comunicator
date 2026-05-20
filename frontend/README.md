# Frontend Demo Notes

This frontend is intended for local/demo and cloud pilot use.

Uploads persistence warning:
1. File metadata is stored in Postgres.
2. Production should use private Supabase Storage when configured with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET`.
3. If Supabase Storage is not configured, uploaded file blobs are stored on the backend filesystem (`backend/uploads` by default, or `UPLOAD_DIR` when set).
4. On free cloud hosts with ephemeral disks, blank/local `UPLOAD_DIR` is not durable and uploaded files may be lost on restart/redeploy.

Production frontend environment:
1. `VITE_API_URL` must point to the Render backend, not localhost.
2. `VITE_DATA_MODE=api`.
3. `VITE_ENABLE_DEMO_LOGIN=false`.
4. `VITE_API_TARGET=primary`.
5. Leave `VITE_API_URL_SECONDARY` blank unless intentionally using a secondary backend.
