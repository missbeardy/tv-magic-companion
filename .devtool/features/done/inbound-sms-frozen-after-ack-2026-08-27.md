---
id: "inbound-sms-frozen-after-ack-2026-08-27"
status: "done"
priority: "critical"
assignee: null
epic: "Inbound"
dueDate: null
created: "2026-08-27T00:30:00.000Z"
modified: "2026-08-27T00:55:00.000Z"
completedAt: "2026-08-27T00:55:00.000Z"
labels: ["inbound", "sms", "bug", "prod-outage", "regression"]
order: "Z0"
---

# Inbound SMS froze after the Twilio ack

A regression introduced by v1.1.184 and live in prod from **26-08-2026 06:03:44 UTC**
until this fix. Every inbound SMS returned a clean `200` to Twilio and created no lead.

## How it presented

Twilio was healthy, the webhook returned 200, and error 11200 had stopped — every signal
the founder could see said the pipeline was working. The leads simply were not there.

## Why

v1.1.184 moved the Twilio ack ahead of the pipeline to stop the 15s timeout
(error 11200 on every single message for weeks). Correct instinct, wrong mechanism:

```ts
respondOk(res)                                     // response flushed
console.log(`SMS from ${fromNumber} to ${toNumber}`) // ran — same tick, synchronous
const { orgId } = await resolveOrgIdFromDid(...)     // never resumed
```

Vercel freezes the invocation the moment the response is flushed. The commit's claim that
`withObservability` keeps the container alive holds only while the response is still open.
Post-response work has to be registered with `waitUntil` — which this repo already does
correctly in [api/_lib/quotes.ts](../../api/_lib/quotes.ts) for slow quote delivery.

## Evidence gathered before touching code

Every check below distinguishes this cause from the obvious suspects, and all of them
pointed the same way:

- **Vercel runtime log** for request `8lrkl-1787789145570-b77d81ab310e`: two lines,
  `DeprecationWarning` and `SMS from +61480437390 to +61468050366`, then nothing. No
  `Lead saved`, no `No org_id`, no `Inbound SMS disabled`, no exception. That log line
  sits *after* the signature check, so the signature verified and `TWILIO_AUTH_TOKEN`
  is present in prod (confirmed separately against the Vercel env API).
- **`rate_limit_hits`** has `inbound-sms` rows at 00:04, 00:05 and 00:11 on 27-08 — the
  work *before* `respondOk` ran every time.
- **`workflow_runs`** has nothing after 26-08 05:35. `startWorkflowRun` is the first
  statement in `processInboundLead`, so the pipeline was never entered.
- **`unrouted_inbound`** empty — not a DID mapping miss. `org_phone_numbers` maps
  `+61468050366` → TV Magic South Brisbane, and `inbound_sms` is `true` for `tv-magic`.
- **Twilio**: every inbound before the deploy carries error 11200; every one after is
  clean. The 502 fix worked. It took lead creation with it.

## The fix

The post-ack pipeline moves into `finishInboundSms()` and is handed to
`waitUntil()` ([api/inbound-sms.ts](../../api/inbound-sms.ts)).

`api/inbound-email.ts` still responds *after* it works, so it was never affected.

## Leads lost and replayed

Four inbound messages landed in the gap. All four were still in Twilio and were replayed
after the fix; only one was a real enquiry.

| Sent (UTC) | From | Body |
|---|---|---|
| 26-08 06:20:51 | +61449947247 | `Test` |
| 27-08 00:04:50 | +61480437390 | `Test` |
| 27-08 00:05:46 | +61480437390 | `0403162833 seven hills` |
| 27-08 00:11:51 | +61451177893 | `Test inbound` |

## What this says about the guard rails

The 26-08 audit script (`scripts/audit-prod-config.mjs`) was written the same day to catch
"repo is right, prod is wrong". It would not have caught this: the repo and prod agreed,
the code deployed cleanly, typecheck and tests passed, and the endpoint returned 200. The
only witness was the absence of rows. A synthetic inbound probe that asserts a lead lands —
not that a webhook returns 200 — is the check that would have caught it.
