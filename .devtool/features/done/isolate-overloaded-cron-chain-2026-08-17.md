---
id: "isolate-overloaded-cron-chain-2026-08-17"
status: "done"
priority: "high"
assignee: null
dueDate: null
created: "2026-08-17T00:00:00.000Z"
modified: "2026-08-17T00:15:00.000Z"
completedAt: "2026-08-17T00:15:00.000Z"
labels: ["bug", "production", "cron"]
order: "ZM"
---

# Isolate overloaded cron chain

The 15-minute GitHub Actions job POSTed `/api/cron/contact-follow-up`, which ran eight jobs
serially inside Hobby's 60s cap on `api/send-sms.ts`. A slow invoice chase timed the function
out (504) and skipped quote chase, booking reminders, purges, and the heartbeat.

Failed run: https://github.com/missbeardy/tv-magic-companion/actions/runs/31980390013
(16-08-2026 23:53 UTC). Last app log was `INVOICE_CHASE_SWEEP`; later stages never completed.

There is no native Vercel `crons` array to repair — Hobby is daily-only, so the scheduler stays
in GitHub Actions.

## Fix shipped (v1.1.175)

Three isolated actions on the existing `api/send-sms.ts` hub (`api/_lib/cronActions.ts`):

| Action | Path | Cadence | Heartbeat key |
|---|---|---|---|
| Contact follow-up | `/api/cron/contact-follow-up` | every 15 min | `contact_follow_up` |
| Invoice/quote/booking sweeps | `/api/cron/automation-sweeps` | hourly | `automation_sweeps` |
| Workflow/notification/rate-limit purge | `/api/cron/maintenance` | daily 18:00 UTC | `cron_maintenance` |

- Missing `PLATFORM_URL`/`CRON_SECRET` now fails the workflow (`exit 1`) instead of a silent skip.
- `curl --fail-with-body --max-time 55` so a hang fails before Vercel's 60s kill.
- Platform Admin Workflow Runs shows all three heartbeats.
- Isolation tests in `tests/cronActions.test.ts`.

## Closed 17-08-2026 — shipped to prod

- Commit `a10f0ab` on `main`, production READY.
- All three workflows dispatched green after deploy:
  - follow-up: checked 46, reminded 3
  - sweeps: invoice/quote/booking all 0 (no enabled orgs)
  - maintenance: purged 46 old notifications
- Fresh `cron_heartbeats` rows for the three new keys. The old `contact_follow_up_chain` row is
  leftover history only.
