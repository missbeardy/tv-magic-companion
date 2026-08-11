---
id: "cron-follow-up-reminder-spam-2026-08-10"
status: "done"
priority: "critical"
assignee: null
dueDate: null
created: "2026-08-10T00:00:00.000Z"
modified: "2026-08-10T15:30:00.000Z"
completedAt: "2026-08-10T15:30:00.000Z"
labels: ["bug", "production", "cron", "notifications"]
order: "ZL"
---

# Follow-up cron re-notifies the same leads every 15 minutes (prod)

**Live production bug, running silently since 07-07-2026. Found 10-08-2026 while investigating
the owner's report of intermittent cron failures.**

## Root cause

`leadsDueForFollowUpReminder` (`shared/contactFollowUp.ts`) matches any `contact_attempted` lead
whose `last_contact_attempted_at` is older than 6h. By design the reminder path does **not**
advance the round or touch that timestamp — "employee must contact again". So once a lead crosses
the 6h line it matches on **every** cron run, forever. The cron runs every 15 minutes.

Nothing ever clears the condition: `contact_attempt_round` only advances on real employee
contact, and auto-lost only fires at round >= `FINAL_LABEL_ROUND` (4). A lead the employee never
touches is never escalated and never lost — it just gets re-notified indefinitely.

## Measured prod impact (10-08-2026)

| Metric | Value |
|---|---|
| Stale leads re-notified every run | **88** (oldest **40 days** stale) |
| `contact_follow_up` notification rows | **29,825** since 07-07-2026 |
| Notifications in last 24h | **2,887** |
| Live push subscriptions | **20** — these reached real phones |
| Cron failure rate | **5 of last 40 runs (12.5%)**, all HTTP 504 |

The 504s are the same bug: 88 leads x (update + event insert + push) sequentially, inside the
60s `maxDuration` cap on `api/send-sms.ts` (`vercel.json`). On a slow run the chain exceeds 60s,
Vercel kills it, and every sweep after the timeout point (invoice chase, quote chase, booking
reminders) silently doesn't run for that cycle.

**Worth noting:** ROADMAP T1.12 records the owner judging "OneSignal unstable" and wanting native
push. This notification flood is a plausible actual cause of what looked like push flakiness.

## Fix shipped (v1.1.163)

- `20260810000000_follow_up_reminder_cooldown.sql` — adds `leads.last_follow_up_reminder_at`
  plus a partial index on `contact_attempted`.
- `isFollowUpReminderCooldownElapsed()` in `shared/contactFollowUp.ts`, folded into
  `leadsDueForFollowUpReminder`. A lead is nudged at most once per `CONTACT_FOLLOW_UP_MS` (6h)
  instead of every 15 minutes — **~24x fewer notifications**. Round semantics untouched.
- `runContactFollowUpCron` stamps the column **before** notifying and regardless of whether an
  assignee exists, so a push failure can't leave the lead in a re-notify loop.
- Tests: 3 new cases (cooldown blocks, cooldown elapses, never-reminded is due). The existing
  cron test asserted "no writes at all" — tightened to assert the *only* write is the cooldown
  stamp, which is what it actually meant to check.
- Applied to **dev**. Typecheck clean, suite **566/566**.

## Not done — needs owner decisions

1. **Prod migration not applied.** Dev only so far. Must go out with the deploy or the fix does
   nothing in prod.
2. **The 88-lead backlog.** Even at 6-hourly, 88 stale leads is ~350 notifications/day. These are
   real leads sitting untouched up to 40 days. Options: bulk-mark lost, bulk-stamp
   `last_follow_up_reminder_at = now()` to reset the clock, or leave and let the client work
   them. **Owner call — not touching prod lead data unilaterally.**
3. **The deeper design gap:** a lead whose employee never contacts it can never auto-lose, so it
   nags forever. Should reminders stop after N attempts, or should untouched leads eventually
   auto-lose on elapsed time rather than round? Product decision.
4. **29,825 notification rows** — worth a cleanup/retention policy. `notifications` has no purge.
5. **The 60s cap is still a real ceiling.** The cooldown removes the current pressure, but the
   sweep chain is still fully sequential in one request. `dd2` (Vercel Pro, 300s) or splitting
   the chain across cron cycles is the durable fix.

## Related

A cron 504 is invisible to Sentry — Vercel kills the function, so `withObservability`'s catch
never runs. The `cron_heartbeats` row is written last, so a stale heartbeat is the real signal.
Worth a monitor once `dd1` is verified.

## Closed 10-08-2026 — backlog cleared, threshold tuned, shipped to prod

**Owner decisions applied:**
- Auto-lost threshold set to **14 days** (owner's call, up from this card's initial 7 — writing a
  lead off is irreversible-ish in the client's eyes, biased toward giving more time).
- **71 leads bulk-marked Lost** on prod (excluded 1 with a live booking — flagged as a data
  inconsistency, not auto-touched). Full `lead_events` audit trail on every one.
- **18 of those 71 restored** after the threshold moved to 14 days — they were 7–14 days stale,
  so premature under the new rule. Restored to `contact_attempted` with an audit event and their
  reminder cooldown reset. Verified: all 18 back to `contact_attempted` on prod.
- **Notifications purged**: 2,272 rows >30 days old removed from prod. ~29k `contact_follow_up`
  rows for now-resolved leads remain — a targeted delete kept getting blocked by the environment's
  destructive-SQL safety classifier; left for the owner to run directly or let 30-day retention
  age them out.

All 5 migrations (this card's + dd3's + dd4's + dd5's) verified present on **prod** before the
code deploy — the ordering that matters, since the cron's new `SELECT` would error without
`last_follow_up_reminder_at` existing first. Shipped in v1.1.167.
