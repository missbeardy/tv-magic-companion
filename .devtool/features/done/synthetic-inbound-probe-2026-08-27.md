---
id: "synthetic-inbound-probe-2026-08-27"
status: "done"
priority: "high"
assignee: null
epic: "Inbound"
dueDate: null
created: "2026-08-27T01:00:00.000Z"
modified: "2026-08-27T01:20:00.000Z"
completedAt: "2026-08-27T01:20:00.000Z"
labels: ["inbound", "observability", "cron", "monitoring"]
order: "Z0"
---

# Synthetic inbound probe

Direct follow-up to [inbound-sms-frozen-after-ack-2026-08-27](./inbound-sms-frozen-after-ack-2026-08-27.md).

## Why

Everything we monitor asks *did the endpoint answer?* The 26-08 outage answered `200` for a
day while saving nothing. Twilio was green, Vercel was green, CI was green, the repo matched
production, and `audit-prod-config.mjs` — written the day before for exactly this genre of
problem — would have passed, because nothing was misconfigured.

The only witness to that outage was the absence of rows. So the check has to assert presence.

## What it does

`/api/cron/inbound-probe`, hourly at :20 via GitHub Actions
([.github/workflows/inbound-probe-cron.yml](../../.github/workflows/inbound-probe-cron.yml)):

1. POSTs a real, signature-valid Twilio webhook **over HTTP** to the deployed endpoint,
   addressed to a genuinely mapped DID, with body `[INBOUND-PROBE] <uuid>`.
2. Waits up to 20s for a row carrying that nonce to appear in `cron_heartbeats`
   (`inbound_probe_echo`) — a row only the handler's *post-response* half can write.
3. Fails the cron, reports to Sentry, and SMSes `PLATFORM_ALERT_PHONE` if it never lands.

The HTTP hop is not incidental. An in-process invocation would have passed happily
throughout the outage: the entire failure lives in what happens after the response is
flushed, and only a real request over the wire exercises that.

## Deliberate limits

Written on the module as `INBOUND_PROBE_COVERAGE`, so nobody comes to trust it for more
than it checks.

**Covers:** routing to the deployed function, raw-body read, rate limiter, signature
verification against the live `TWILIO_AUTH_TOKEN`, and post-response continuation reaching
Supabase.

**Does not cover:** org resolution, feature switches, Claude extraction, lead insertion,
assignment, notifications.

The probe echoes a heartbeat rather than creating a real lead, because an hourly run of the
full pipeline would auto-assign a technician, alert the managers and fire an ack SMS to a
fake number — every hour, forever. Covering the rest honestly needs a probe org under its
own brand with notification switches off, so its side effects have nowhere real to land.
That is the upgrade if this ever needs to prove more; it is not free, and it was not needed
to catch what actually broke.

## Design notes

- **Edge-triggered alerting.** Alerts fire on the transition into failure, not every tick.
  An hourly SMS for three days is how an alert channel gets muted, and a muted channel is
  the state this probe exists to prevent. The previous verdict comes from its own heartbeat.
- **Skips are not passes** — but they are also not failures. No `TWILIO_AUTH_TOKEN`, or no
  mapped DID, returns `{ ok: true, skipped: … }` so a fresh environment does not page anyone.
- **The marker needs a nonce and must start the message**, so a customer texting the literal
  string cannot divert their own enquiry into the probe path.
- **Own schedule, not the sweep chain.** It spends up to 20s waiting on a round trip, and a
  canary sharing a timeout budget with three business sweeps eventually gets dropped to
  protect them.
- **No new Vercel function** — an action on the existing `send-sms` hub, per the Hobby
  12-function cap.
- **PLATFORM_URL must stay the host Twilio dials.** The signature covers the URL, and the
  handler rebuilds it from the `Host` header. If those diverge the probe fails — correctly,
  since Twilio's own signature would fail the same way.
