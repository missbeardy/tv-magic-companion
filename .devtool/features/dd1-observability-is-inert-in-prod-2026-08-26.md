---
id: "dd1-observability-is-inert-in-prod-2026-08-26"
status: "backlog"
priority: "critical"
assignee: null
epic: "Observability"
dueDate: null
created: "2026-08-26T06:30:00.000Z"
modified: "2026-08-26T06:30:00.000Z"
completedAt: null
labels: ["observability", "dd1", "config"]
order: "ZK"
---

# dd1 observability is inert in prod

Found 26-08-2026 by the first run of `npm run audit:prod`.

## Why

`dd1` is recorded as shipped and **verified against real prod data** (v1.1.167, 10-08-2026),
and the whole "no feature work until dd1 lands" rule was built on it. But none of the
Sentry or PostHog variables exist in the Vercel production environment:

```
SENTRY_DSN                not set
VITE_SENTRY_DSN           not set
POSTHOG_PROJECT_TOKEN     not set
POSTHOG_HOST              not set
```

`api/_lib/sentry.ts` is explicitly built to no-op when `SENTRY_DSN` is unset — reasonable
for local dev, silent in production:

```ts
const dsn = process.env.SENTRY_DSN
if (!dsn) return
```

So `captureServerException` has never reported anything from prod. Every `catch` in the
`api/` tree that logs and returns 200 has been discarding its error into Vercel runtime
logs that nobody reads and that age out.

This is the reason the notification outage ran for 16 days: the one mechanism designed to
make silent failures visible had never been switched on. It also means the Sentry call
added to `api/inbound-sms.ts` in v1.1.184 currently goes nowhere.

44 of 46 production variables are set and correct, so this is not a general config problem —
it is specifically the observability ones, which are also the only ones whose absence
produces no symptom.

## Spec

Set `SENTRY_DSN`, `VITE_SENTRY_DSN`, `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST` in Vercel
production, then confirm an event actually arrives — do not trust the deploy. Throw a
deliberate error through a non-destructive endpoint and look for it in the Sentry inbox.

The DSNs exist in `.env.local`, so the values are known; this is a Vercel dashboard change,
not code. They are already on the required list in `scripts/audit-prod-config.mjs`, so once
`VERCEL_TOKEN` is configured the audit will fail until they are set.

Worth deciding separately whether `sentry.ts` should still no-op when `VERCEL_ENV === 'production'`,
or refuse to start. Silence is right for a laptop and wrong for prod.

## Feature switch

**None.** Configuration, not behaviour.

## Done when

- All four variables set in Vercel production
- A test exception is visible in Sentry, raised from the deployed app rather than assumed
- `npm run audit:prod` passes the `vercel-env` checks
- `ROADMAP.md`'s dd1 entry corrected — it currently claims verification that did not hold

## Related

- Found by: `prod-config-drift-audit`
- Governing doc that treats dd1 as complete: `DUE_DILIGENCE_REVIEW.md`
