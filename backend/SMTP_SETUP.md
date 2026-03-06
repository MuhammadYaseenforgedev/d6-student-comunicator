# SMTP Setup For OTP Emails (Render)

This backend supports SMTP delivery for OTP emails in production.

## Required Render Environment Variables

Set these in your Render backend service:

- `SMTP_HOST`  
  Example: `smtp.your-mail-provider.com`
- `SMTP_PORT`  
  Example: `587`
- `SMTP_SECURE` (optional boolean-like)  
  Use `true` for implicit TLS (usually port 465), otherwise `false` (usually port 587/starttls).
- `SMTP_USER`  
  Example: `no-reply@forgeacademy.example`
- `SMTP_PASS`  
  Example: `your-smtp-app-password`
- `SMTP_FROM`  
  Example: `"Forge Academy <no-reply@forgeacademy.example>"`

## Behavior

- In production, OTP email sending uses SMTP via Nodemailer.
- If SMTP is not configured, OTP request returns an error:  
  `OTP email service is not configured`
- Development/demo OTP behavior remains unchanged.

## Render Note

After changing Render environment variables, trigger a redeploy (or restart) so the new values are loaded.
