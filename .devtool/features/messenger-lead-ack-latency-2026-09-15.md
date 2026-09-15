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

## The `wf-error` card — cause confirmed, and it is not ours

`origin: workflow://wf-error/node/nd-58fca56e01/card/ins-2762f70004` is Botpress's generic
*"Sorry, an error occurred"*. The card that actually throws is the Execute Code card
`ins-cefc2248d6` in the **suburb-timeout branch** of the Botpress workflow:

```js
if (!user.awaitingSuburb) {
  throw new Error('Timeout: awaitingSuburb was ' + user.awaitingSuburb)
}
const name = String(user.pendingName || '').trim()
const phone = String(user.pendingPhone || '').trim()
```

The 90s suburb timer fires regardless of what the customer did in the meantime. If they
already answered — clearing `awaitingSuburb` — the guard trips and **throws**, which
Botpress surfaces to the customer as the generic error. The author meant it as an early
exit; an uncaught throw in an Execute Code card is customer-facing.

This explains every trace-less occurrence: the throw happens *before* the lines that read
name/phone and call our webhook, so no request is ever made — hence no `workflow_run`, no
lead, no `unrouted_inbound` row. My earlier 400-from-`parseFacebookLeadBody` theory was
wrong. **No app-side change is needed.**

Fix belongs in Botpress Studio — invert the guard so the branch simply does nothing:

```js
if (user.awaitingSuburb) {
  /* existing submit */
}
```

Better still, put `user.awaitingSuburb === true` on the transition into the card so it
never runs. Worth checking while in there: `conv_01M1SWY9PSHK8H0WKG43AAA1R5` threw this on
06-09 00:08:57 and produced no lead until 14-09, so a real enquiry may have been dropped.
