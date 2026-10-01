---
id: "missed-call-capture-for-any-mobile-2026-10-01"
status: "in-progress"
priority: "high"
assignee: null
dueDate: null
created: "2026-10-01T00:00:00.000Z"
modified: "2026-10-01T00:00:00.000Z"
completedAt: null
labels: ["inbound", "lead-intake", "voice"]
order: "a3"
---

# Missed-call capture for any mobile

Owner request 01-10-2026. ROADMAP block: **T1.20**.

Tradie keeps their number. They dial three conditional-divert codes once; unanswered calls
go to a FieldBourne answering line instead of MessageBank, and the voicemail (or hang-up)
becomes a lead with recording, transcript and a text-back.

## Decisions (owner, 01-10-2026)

- Provider: test both — Crazytel (Australian) first, capture-first; Twilio Voice fallback.
- Mobile Message stays the text-back sender (SMS-only, cannot take calls).
- Hang-up with no message → lead + text-back.
- Switch: existing `inbound_calls` (no new switch).
- Text-back for forwarded calls only; 3CX voicemails unchanged.

## Phase A (provider-neutral core)

- [x] Migration (written; owner to apply dev → prod before any deploy): `lead_voicemails.source` += `call_forward`; `org_phone_numbers.kind`
- [x] `processVoicemail` metadata/dedupKey overrides, `noMessage`, ack for `call_forward`
- [x] `api/_lib/forwardedCall.ts` + `inbound-sms?action=voice&provider=` routing
- [x] Franchise Settings "Missed-call capture" card
- [x] Inbound probe filters `kind='sms'`

## Phase B (Crazytel trial)

- [ ] Owner: account, 1 DID + voicemail module, webhook URL + secret, map DID to `fbd`
- [ ] Capture payloads from 5 test calls; go/no-go checklist
- [ ] Adapter + fixtures

## Phase C (Twilio, only if Crazytel fails)
