# Email Notifications

Kravient Build currently sends password-reset emails through the Resend email API.

## Local demo mode

Leave `RESEND_API_KEY` empty. Reset emails are shown as a safe server-side preview, and the reset code is displayed on the local reset screen.

## Send real emails

1. Create a Resend account and verify a sending domain.
2. Add `RESEND_API_KEY` and `EMAIL_FROM` to `apps/api/.env`.
3. Restart the API server.

Never commit real provider keys to source control.
