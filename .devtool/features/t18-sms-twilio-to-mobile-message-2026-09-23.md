---
id: "t18-sms-twilio-to-mobile-message-2026-09-23"
status: "review"
priority: "medium"
assignee: null
epic: "Messaging"
dueDate: null
created: "2026-09-23T00:00:00.000Z"
modified: "2026-09-23T12:00:00.000Z"
labels: ["sms", "twilio", "mobile-message", "cost", "inbound", "cleanup"]
order: "ZL"
---

# Move SMS from Twilio to Mobile Message

Spec: ROADMAP.md **T1.18**. Owner request 23-09-2026. The reason is cost; Mobile Message is also an Australian provider.

## Numbers (Twilio usage API, 23-09-2026)

| | Twilio (Aug 2026) | Mobile Message equivalent |
|---|---|---|
| Outbound | 380 msgs / ~807 segments, US$41.56 | ~807 credits × 3.5–4¢ = A$28–32 |
| Inbound | 80 msgs, US$1.51 | free |
| AU number | US$8.25/mo | first dedicated number free |
| US demo number | US$1.15/mo (idle — release now) | — |
| **Total** | **US$52.48 (~A$80)** | **~A$28–32** |

Saving is about **A$550–600 a year**.

## Decisions (owner, 23-09-2026)

- The number **cannot be ported**. A new Mobile Message dedicated number is fine, since it is only used by TV Magic.
- **No feature switch.** A per-org `orgs.sms_provider` column, defaulting to `twilio`. This lets it be proven on the FieldBourne Digital (`fbd`) org in prod before TV Magic moves.
- **The old Twilio number keeps receiving inbound for ~30 days**, then is released.
- **Delete employee WhatsApp.** It is kill-switched off, and it is the only reason to keep Twilio.

## Build checklist

- [x] Migration written: `supabase/migrations/20260923090000_org_sms_provider.sql` (`orgs.sms_provider` default `twilio` + CHECK, and `sms_provider` added to the AUD-2 privileged-column lock)
- [ ] Migration applied to dev and then prod — **ops, not done** (agent was not allowed to touch either database). Code tolerates the column being absent: `loadOrgSmsConfig` falls back to Twilio.
- [x] `smsSend.ts` (`sendOrgSms`) reads `orgs.sms_provider`, is provider-neutral and sends to Mobile Message with `enable_unicode: true` and an `Idempotency-Key` (reused on its one retry); per-message `error`/`blocked` = not sent
- [x] Route the direct Twilio callers through it (`notifyManagersNewLead` + `send-sms` internal modes now gate on `isOrgSmsReady`, `sendBrandedSms` — so ack, booking confirm/reminder, quotes, review requests — `smsReply`, `sendEmployeeAlert`)
- [x] `inbound-sms.ts?provider=mm`: raw-body HMAC (`X-MM-Timestamp`/`X-MM-Signature`), 5-min freshness window, rejects when the secret is unset, ack-then-`waitUntil`, dedupe (atomic `increment_rate_limit` on sender + to + `received_at` + body), `type: "unsubscribe"` → `sms_opt_outs`; status webhooks (`&kind=status` or by payload) verified + logged
- [x] Rewire `inboundProbe.ts` and `platformSimulateInbound.ts` to the new signer (chosen by the DID's org `sms_provider`; `INBOUND_PROBE_PROVIDER` overrides the probe)
- [x] Delete WhatsApp (`sendEmployeeWhatsApp`, templates, tests, `TWILIO_WHATSAPP_*`, `EMPLOYEE_WHATSAPP_ENABLED`)
- [x] Update the privacy policy subprocessor list, `.env.example`, `audit-prod-config.mjs`, `api/_lib/env.ts`, `ONBOARDING_RUNBOOK.md`, `PROJECT.md`
- [x] Changelog and version bump (v1.1.201). `SALES_PIPELINE_WORKFLOW.md` → 1.10.0

## Build notes (23-09-2026)

- **Deferred:** `sendPlatformSms` (platform alerts to `PLATFORM_ALERT_PHONE`, from `TWILIO_FROM_NUMBER`) stays on Twilio: it has no org, so no `sms_provider`. It must move (or get a `MOBILE_MESSAGE_PLATFORM_FROM` env) before Twilio is closed in cutover step 6.
- **Deferred:** Platform Admin visibility of `sms_provider` — not trivial (no org SMS fields are shown there today); the switch is an ops SQL UPDATE, like `sms_from_number`.
- **Deferred:** a customer who replies START after a Mobile Message unsubscribe is removed from our `sms_opt_outs`, but Mobile Message keeps its own block, so sends come back `blocked` (reported as opted out). Fix would be a `DELETE /v1/unsubscribes` call on START.
- **Deferred:** the "Twilio diagnostics" runbook is an agent memory file outside the repo, not updated here.
- Also fixed in passing: the in-process Platform Admin SMS simulator handed `inbound-sms` a parsed object, which `readRawBody` re-serialised as JSON and the Twilio path then failed to re-parse; it now passes the raw body. And it now picks the org's sending number when an org has two mapped DIDs (the changeover state).

## Cutover (ops)

1. Sign up (50 free credits), then make the first purchase within 30 days. It is 1.6¢ per credit at any tier and unlocks the free dedicated number. No sandbox.
2. Set the webhook URLs and signing secret
3. Attach the number to **`fbd`** (`org_phone_numbers`, `sms_from_number`, `sms_provider`) and run the Done-when list with real phones
4. Repoint the same number and `sms_provider` to TV Magic (`default`). The old Twilio DID stays mapped for inbound
5. Update the website form forwarder, the Google Business listing and ads with the new number
6. After ~30 quiet days, release `+61468050366` and close Twilio
