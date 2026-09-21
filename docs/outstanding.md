# Outstanding follow-ups

## Undeploy `notify-message` (edge function)

`supabase/functions/notify-message` is leftover support-messaging push. It must be **undeployed from prod**, not just deleted from git. Do this in the next edge-function pass; do not remove the function from the repo until prod is confirmed empty.

## Deferred from 2026-09-16 review

- `loadOrgRuntimeContext` (P4) — skip until switch round-trips are a measured problem
- Quote chase / AI quoting / Xero remain paused
