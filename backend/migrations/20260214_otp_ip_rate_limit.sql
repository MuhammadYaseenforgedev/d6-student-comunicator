-- =========================
-- OTP: store request IP (DB-backed rate limiting)
-- =========================

ALTER TABLE email_otps
ADD COLUMN IF NOT EXISTS request_ip text;

CREATE INDEX IF NOT EXISTS idx_email_otps_request_ip_created
ON email_otps (request_ip, created_at DESC);

-- Optional: helps case-insensitive email lookups too (already index lower(email) in another index)
-- (Keep, harmless if already covered by existing composite index)
-- CREATE INDEX IF NOT EXISTS idx_email_otps_lower_email_created
-- ON email_otps (lower(email), created_at DESC);
