# Email Reminders

The app includes a daily Vercel Cron route at `/api/reminders`.

It emails unpaid bills due today or within the next 3 days, then writes to `reminder_log` so the same bill and due date are not emailed repeatedly.

Required Vercel environment variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `REMINDER_FROM_EMAIL`
- `REMINDER_TO_EMAIL`
- `CRON_SECRET`

The cron runs daily at 15:00 UTC. If `CRON_SECRET` is set, manual calls must include:

```bash
Authorization: Bearer your-secret
```

Use a verified Resend sender for `REMINDER_FROM_EMAIL`.
