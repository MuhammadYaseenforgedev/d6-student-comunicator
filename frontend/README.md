# Frontend Demo Notes

This frontend is intended for local/demo and cloud pilot use.

Uploads persistence warning:
1. File metadata is stored in Postgres.
2. Uploaded file blobs are stored on backend filesystem (`backend/uploads` by default).
3. On free cloud hosts with ephemeral disks, uploaded files may be lost on restart/redeploy.
