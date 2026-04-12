# Email Reminders

The app includes a daily Vercel Cron route at `/api/reminders`.

It emails unpaid bills that are overdue, due today, or due within the next 7 days, then writes to `reminder_log` so the same bill and due date are not emailed repeatedly.

Required Vercel environment variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `REMINDER_TO_EMAIL`
- `CRON_SECRET`

The cron runs daily at 15:00 UTC. If `CRON_SECRET` is set, manual calls must include:

```bash
Authorization: Bearer your-secret
```

Use the same Gmail app password setup as invite emails.

To preview what would be sent without sending email or writing reminder logs, call:

```bash
/api/reminders?dryRun=1
```

To send a test email even if the same bills were already logged as sent, call:

```bash
/api/reminders?force=1
```
