---
id: "voicemail-fallback-oversized-recordings-2026-08-11"
status: "review"
priority: "high"
assignee: null
dueDate: "2026-08-13T00:00:00.000Z"
created: "2026-08-11T00:00:00.000Z"
modified: "2026-08-11T00:00:00.000Z"
completedAt: null
labels: ["bugfix", "lead-intake", "voicemail"]
order: "a1"
---
# Voicemail fallback — recover the recordings CloudMailin rejects

## ⚠️ BLOCKED ON OWNER — 4 steps, ~20 minutes (written 11-08-2026, owner away until 13-08)

Code is built, merged-ready and verified (625 tests, typecheck, build, lint all green). **It does nothing at all until these four are done**, and voicemails keep being lost in the meantime. Nothing here is destructive; the poller is hard-off while unconfigured (`getVoicemailMailboxConfig()` returns null ⇒ `not_configured`).

1. **Apply the migration to prod** via the Management API: `supabase/migrations/20260811160000_lead_voicemails.sql`. Creates the `lead_voicemails` table and the private `lead-voicemails` bucket.
2. ~~**Gmail filter**~~ — **already done.** The mailbox already labels 3CX voicemail mail `tvmagic-sales-lead-voicemail-lead`, which is now the configured default. Nothing to create. Only check: account-level forwarding must not be set to *"delete Gmail's copy"* — that would leave no original to poll. Keep or archive are both fine, and an earlier note claiming "Skip the Inbox" breaks the CloudMailin forward was **wrong**: archiving and forwarding are independent in Gmail.
3. **Google App Password** (Account → Security → App passwords; requires 2FA). Then set five vars in Vercel — see `.env.example` for the documented block:
   - `VOICEMAIL_MAILBOX_ORG_ID` — the `tv-magic` org UUID
   - `VOICEMAIL_IMAP_HOST=imap.gmail.com`
   - `VOICEMAIL_IMAP_USER=fieldbournedigital@gmail.com`
   - `VOICEMAIL_IMAP_APP_PASSWORD` — the 16-char app password, **not** the login password
   - `VOICEMAIL_IMAP_FOLDER` — optional; defaults to `tvmagic-sales-lead-voicemail-lead`
4. **Check repo secrets** `PLATFORM_URL` and `CRON_SECRET` exist (both already used by the contact-follow-up cron — reused, not duplicated). Without them `.github/workflows/voicemail-poll-cron.yml` exits 0 silently and you'd think it was running.

**Then UAT:** leave a >30s voicemail on the 3CX line. Within 5 minutes a lead should appear with a playable recording. Also leave a ~10s one and confirm it still arrives instantly via CloudMailin, now with audio attached too.

---

Owner report 11-08-2026: voicemails were reaching the app inconsistently. Root cause found by measuring the two real samples the owner supplied (`vmail_0427711088_166_20260727015014.wav` and the bounce `.eml`, both now gitignored — the customer's mobile is in the filename and the body).

**The cutoff is ~25 seconds of speech, not "large voicemails".** The DSN says:

```
Diagnostic-Code: smtp; 552 Message size exceeds the allowed size for this account (524288)
Final-Recipient: rfc822; 4229e7fdfa9bbb4d13c6+default@cloudmailin.net
```

3CX records **PCM mono 8 kHz 16-bit = 16 KB/sec**, and base64 inflates by ~33%, so the effective ceiling is ~393 KB of audio. The sample is 26.6s → 425,646 bytes → ~554 KB encoded → rejected. Every voicemail past roughly 25 seconds has been silently lost: no lead, no callback, nothing in the app. Since a useful voicemail is usually longer than 25 seconds, this is likely the *majority* of them.

The audio is not recoverable from the bounce — the DSN is 21 KB against a 554 KB original, headers only. But the original is still sitting in the Gmail mailbox.

## Spec

**Ingest (bug fix).** The voicemail branch of `api/inbound-email.ts` moved to `api/_lib/processVoicemail.ts`, transport-neutral (body text, subject, from, message id, audio buffer). CloudMailin and the new poller both call it, so behaviour cannot drift between them. Everything downstream is reused unchanged: `extractVoicemailMetadata`, `formatAuPhoneForSms`, `findRecentLeadByPhone`, `enrichLeadFromVoicemailTranscript`, `extractFromVoicemailTranscript`, `insertRawFirstLead`, `processInboundLead` with its existing hookback follow-up.

**IMAP, not the Gmail API.** The mailbox is a personal `@gmail.com`, so an OAuth app on Gmail's restricted scopes would sit in "Testing" status where **refresh tokens expire every 7 days** — the poller would die weekly, and publishing needs Google brand verification. An app password over IMAP has no expiry and no review. It also removes all MIME work: the IMAP server reports BODYSTRUCTURE, so `downloadMany` returns already-decoded bytes. One new dependency (`imapflow`), no `googleapis`, no hand-rolled parser.

**Idempotency is the whole risk.** Gmail's auto-forward preserves Message-ID (confirmed: the DSN's `In-Reply-To` carries the original's `<oiXbIzArSCCjFWdeIG7Slw@geopod-ismtpd-14>`), so both transports derive the same key. `lead_voicemails.rfc_message_id` is UNIQUE and **the insert itself is the claim** — a 5-minute poll can overlap the instant webhook, and a SELECT-then-INSERT would leave a race window. The loser catches 23505 and backs off. Without this, the second pass falls through to `findRecentLeadByPhone` and logs a spurious `missed_call_again` — the same notification-noise class as the v1.1.167 prod bug.

**Storage before transcription.** The row is written and the WAV uploaded *before* Whisper runs, so a transcription failure still leaves a playable recording on the lead. Previously the audio was discarded and the tech got "transcription failed, please check 3CX manually". Upload failure deletes the claim so the next run retries cleanly.

**Org routing.** One mailbox = one org via `VOICEMAIL_MAILBOX_ORG_ID`; unset ⇒ the poller returns `not_configured` and touches nothing. It cannot resolve an org itself: a polled message has no CloudMailin plus-tag (that `+default` only exists on the forwarded copy) and its `To: "166"` is a 3CX extension, which `looksLikePhoneNumber` correctly refuses to treat as a DID.

**No new feature switch** — the existing `inbound_calls` gates both paths, and `dd19` (cut the catalog to twelve) is open. The poller is gated on env-var presence instead.

**No new function file.** `?action=voicemail-poll` on the `inbound-email` hub (11/12 slots used), rewritten from `/api/cron/voicemail-poll`, scheduled from GitHub Actions every 5 min because Vercel crons are daily-only on Hobby. `api/inbound-email.ts` gets `maxDuration: 60` — it ran on the 10s default while doing Whisper, so the existing CloudMailin path was likely timing out intermittently too.

**Playback.** The recordings are plain PCM WAV, so a browser `<audio>` element plays them natively — no transcoding. `LeadVoicemail.tsx` mirrors `LeadPhotos.tsx` against a private `lead-voicemails` bucket with short-lived signed URLs, with a download link as an `onError` safety net.

## Done when

- [ ] Owner applies `supabase/migrations/20260811160000_lead_voicemails.sql` to prod (Management API).
- [ ] Owner creates the Gmail filter (`from:noreply@3cx.net subject:"New Voicemail from"` → label `Voicemail`, **leave "skip the Inbox" off** so the CloudMailin forward still fires) and sets the five `VOICEMAIL_*` env vars in Vercel, incl. a Google App Password (needs 2FA).
- [ ] Owner adds the `voicemail-poll` workflow secrets (reuses existing `PLATFORM_URL` + `CRON_SECRET`).
- [ ] A >25s voicemail creates a lead within 5 minutes and the recording plays in the tech view.
- [ ] A <25s voicemail still arrives instantly via CloudMailin, now with a recording attached.
- [ ] Same voicemail seen by both paths → one lead, one row, **zero** `missed_call_again` events.
- [ ] A technician in another org cannot fetch the storage path.

## Not in this item

- **Polling-only.** Owner chose fallback-only on 11-08-2026 so short voicemails stay instant. Worth revisiting after a week of real traffic: if the poller is handling the majority, retiring the CloudMailin voicemail branch removes the dual-write problem entirely and leaves one code path.
- **Loss monitoring.** If the poller dies, voicemails silently stop again. The DSN carries the original Message-ID in `In-Reply-To`, so a later pass could reconcile bounces against `lead_voicemails` and prove nothing was dropped.
- **Transcoding.** Unnecessary — measured PCM, not G.711 µ-law as first assumed.
- **`extractVoicemailMetadata` subject-fallback quirk.** Its character class includes `-` and space, so with no `From:` line it returns `"0400000000 - 0400000000"`. Carried over unchanged and pinned by a test; real 3CX mail always has `From:`, which wins.

**Difficulty:** Medium.

Source: owner request 11-08-2026 — production leads being lost.
