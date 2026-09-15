---
id: "messenger-lead-ack-latency-2026-09-15"
status: "in-progress"
priority: "critical"
assignee: null
epic: "Inbound"
dueDate: null
created: "2026-09-15T00:00:00.000Z"
modified: "2026-09-15T00:00:00.000Z"
labels: ["inbound", "messenger", "botpress", "bug", "lead-intake"]
order: "a0"
---

# Botpress told customers their enquiry failed on leads that had already saved

Reported 15-09-2026 as "the Facebook lead bot keeps throwing an error". Two different
failures wear the same clothes in Botpress; this card fixes the confirmed one.

## Confirmed: the tool call outlives Botpress's patience

Conversation `conv_01M1SWY9PSHK8H0WKG43AAA1R5`, 14-09-2026 (UTC):

| Time | Event |
|---|---|
| 19:38:08.545 | `workflow_runs` row starts |
| 19:38:14.407 | **lead created** — Helen, +61417648057 (`defd9dab`), now `booked` |
| 19:38:34.560 | pipeline finishes — **26.01s** |
| 19:38:34.962 | bot tells the customer *"something went wrong while trying to send your details through… call or text the technician directly on 0449 947 247"* |

402ms after our function returned. `origin: LLMZ` — the agent narrating a tool failure
that never happened. The lead was captured and the job was won anyway; the customer was
told otherwise and pushed to a phone number.

Every Messenger submit is this slow — 9 of 9 runs since 03-09 ran 17.8–26.0s:

| step | seconds (14-09 run) |
|---|---|
| cold start → insert | 6.1 |
| Claude extraction | 3.8 |
| auto-assign notify (Twilio) | 4.3 |
| customer linking | 2.9 |
| ack SMS (Twilio) | 4.1 |

## The fix

`processInboundLead` gains an optional `onLeadInserted` hook; the Botpress HTTP handler
answers `{ success, lead_id }` the moment the row exists and hands the tail to
`waitUntil`. Response contract is unchanged apart from `partial`, which Botpress ignores.

`waitUntil` and not a bare promise: Vercel freezes the invocation when the response
flushes, which silently dropped every inbound SMS for a day
([inbound-sms-frozen-after-ack](done/inbound-sms-frozen-after-ack-2026-08-27.md)).
The native Meta bot and the suburb-timeout cron pass no hook and still await in full.

## Still open: the `wf-error` card

A second, different failure — `origin: workflow://wf-error/node/nd-58fca56e01/card/ins-2762f70004`,
Botpress's generic *"Sorry, an error occurred"*. Seen 05-09 23:33:59 and twice on 06-09
in `conv_01M1SZVSQMYNQJ9C0TRQKNER1D` after Andrew Burton's lead had already saved.

None of those three moments has a `workflow_run`, a lead, or an `unrouted_inbound` row —
so the request either never arrived or was rejected at validation, both of which leave no
trace. Leading theory: the agent re-fires the submit tool at "I'll make a note…" moments
with no name/phone, and `parseFacebookLeadBody` returns a hard `400`, which throws the
card. Needs the failing card's logged status from Botpress to confirm.

If confirmed, the fix is to return `200 { skipped: true, reason: 'incomplete' }` for a
Messenger payload missing name/phone, so a mid-conversation tool call cannot hard-error at
the customer. Honeypot and auth stay `400`/`401`.
