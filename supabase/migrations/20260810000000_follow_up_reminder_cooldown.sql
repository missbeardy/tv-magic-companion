-- Fixes runaway contact-follow-up reminder notifications.
--
-- `leadsDueForFollowUpReminder` matches any contact_attempted lead whose
-- `last_contact_attempted_at` is older than 6h — but the reminder path deliberately does NOT
-- advance the round or touch that timestamp ("employee must contact again"). So once a lead
-- crosses 6h it matches on EVERY cron run, forever. The cron runs every 15 minutes.
--
-- Prod impact measured 10-08-2026: 88 stale leads (oldest 40 days), 29,825 `contact_follow_up`
-- notification rows since 07-07-2026, ~2,887/day and climbing, against 20 live push
-- subscriptions. It was also the direct cause of the cron's intermittent 504s — 88 leads x
-- (update + event insert + push) sequentially inside a 60s Hobby function limit.
--
-- This column gives the reminder its own cooldown, independent of the contact-attempt
-- timestamp, so the round semantics are untouched and a stale lead is nudged at most once per
-- CONTACT_FOLLOW_UP_MS (6h) instead of every 15 minutes.

alter table leads add column if not exists last_follow_up_reminder_at timestamptz;

-- Partial index: the cron only ever scans contact_attempted leads.
create index if not exists leads_follow_up_reminder_idx
  on leads (last_follow_up_reminder_at)
  where status = 'contact_attempted';
