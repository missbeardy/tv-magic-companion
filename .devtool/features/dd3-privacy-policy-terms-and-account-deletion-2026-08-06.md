---
id: "dd3-privacy-policy-terms-and-account-deletion-2026-08-06"
status: "review"
priority: "critical"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-06T21:20:00.000Z"
completedAt: null
labels: ["due-diligence", "legal", "play-store", "compliance"]
order: "Z2"
---

# DD3 Privacy policy, terms and account deletion

**Three of Google Play's six rejection blockers, plus real Australian Privacy Principles exposure with live customer PII.**

Grep found **no privacy policy, no terms, and no account-deletion path** anywhere in `src/`. BUSINESS.md lists these under "legal/compliance to sort before charging strangers" — they have never become work items.

## What's collected (this is the Data Safety declaration)

Customer names, phone numbers, addresses, job **photos**, **GPS location** (`tech_location`), payment metadata. US-hosted subprocessors: Supabase, Vercel, Twilio, Anthropic, Stripe, Resend, OneSignal.

## Spec

1. **Privacy policy** — hosted at a public URL and linked in-app. Must name every subprocessor above, state retention periods for photos and lead data, and address Australian Privacy Principles.
2. **Terms of Service** — required for the subscription flow and any Data Safety claim.
3. **In-app account deletion** + a web-accessible deletion URL (Play requires both for any app allowing account creation). **Non-trivial against the current model** — must decide per data class what is deleted vs anonymised vs retained:
   - Leads/customers: delete or anonymise?
   - `lead_events` audit trail: retain anonymised (it powers reporting)?
   - **Invoices: almost certainly must be retained** for ATO record-keeping obligations — get advice.
   - Photos in storage: hard delete.
4. **SMS compliance** — consent/opt-out line on automated customer SMS (ack, reminder, chase); Spam Act 2003 posture.

**Not legal advice — get proper advice on the retention/deletion matrix before shipping.**

**Feature switch:** none.

**Done when:** privacy policy and terms are live at stable URLs and linked from the app; a user can delete their account from within the app and from a public URL; the deletion matrix is documented; the Play Data Safety form can be filled in truthfully.

**Difficulty:** Medium (deletion), Easy (documents, once written).

Source: DUE_DILIGENCE_REVIEW.md — Phase 6, blockers 1–4.

## Build status (06-08-2026) — engineering done, content is a DRAFT needing your sign-off

**The card said "not legal advice, get proper advice before shipping" — I took that literally.**
The account-deletion *engineering* is real and complete. The privacy policy and terms *text* are
factually accurate to what the app actually does (verified against the code, not guessed), but
they're marked as drafts in the UI itself and are not something to publish as-is — retention
periods, ABN, legal entity name, and APP compliance framing need your (or an accountant's/
lawyer's) sign-off first.

**Deletion matrix decided (documented in `api/_lib/accountDeletion.ts`):** "delete my account"
scrubs the requesting staff member's own profile PII (name/phone/photo) and revokes their login.
It does **not** touch org-level business data (leads, customers, quotes, invoices) — those belong
to the business, not the individual employee, and invoices in particular almost certainly need to
be retained for ATO record-keeping. This is a defensible default for a B2B tool, but flagging it
explicitly since the card asked for the matrix to be documented, not assumed.

**Shipped in code (v1.1.159, uncommitted pending owner review):**
- `supabase/migrations/20260806170000_account_deletion.sql` — `profiles.deleted_at` +
  `account_deletion_requests` table (RLS, service-role only).
- `api/_lib/accountDeletion.ts` — `deleteOwnAccount()` (scrub profile, delete avatar, revoke
  Supabase auth login) and `requestAccountDeletion()` (queues a request, SMS-alerts the platform
  admin via the existing `PLATFORM_ALERT_PHONE` pattern — reused `sendEmployeeAlertToPhone`,
  the same mechanism `captureUnroutedInbound.ts` already uses).
- **In-app deletion:** `api/create-user.ts?action=delete-account` (authenticated, self only) +
  a "Danger zone" section with a confirmation modal in `src/pages/ProfilePage.tsx`.
- **Web-accessible deletion:** `api/send-sms.ts?action=request-account-deletion` (public,
  rate-limited via `dd4`'s limiter) + `src/pages/DeleteAccountPage.tsx` at `/delete-account` —
  queues for manual processing rather than instant self-service, since a public unauthenticated
  form can't safely resolve org-level retention questions on its own.
- `src/pages/PrivacyPolicyPage.tsx` (`/privacy`) and `src/pages/TermsOfServicePage.tsx`
  (`/terms`) — draft content, an amber "pending legal review" banner at the top of each, and
  `[BRACKETED PLACEHOLDER]` fields for anything business-specific (legal name, ABN, address,
  contact email, retention periods, governing state). Linked from `Login.tsx`'s footer and
  `ProfilePage.tsx`'s danger zone.
- **SMS opt-out (Spam Act 2003 posture):** added "Reply STOP to opt out" to the four fallback
  templates the card named — ack (`shared/leadAckCopy.ts`), booking reminder
  (`api/_lib/bookingReminder.ts`), invoice chase and quote chase
  (`api/_lib/invoiceChaseTemplates.ts` / `quoteChaseTemplates.ts`). **Caveat:** any brand that has
  already customised these templates in `sms_templates` (a data column, not code) won't get this
  line automatically — that's a manual Franchise Settings edit for `tv-magic`/`fieldbourne`, not
  something a code change can safely retrofit onto text a franchise wrote themselves.
- `npm run typecheck` clean, extensionless-import grep clean, `vite build` succeeds, full suite
  green: **558/558** (no new tests added here — `accountDeletion.ts` is thin Supabase
  orchestration with no existing mocking pattern in this repo to extend safely; same category as
  `invoices.ts`/`quotes.ts`, which also rely on manual/UAT testing per this repo's conventions).

## Update 07-08-2026 — placeholders resolved, account deletion verified working

**Account deletion tested end-to-end by the owner — works.**

**All placeholders now filled** from the real business details on fieldbournedigital.com.au:
FieldBourne Digital, ABN 22 324 219 568, admin@fieldbournedigital.com.au, Beaudesert QLD,
governed by Queensland law, 5-year retention (ATO), dated August 2026. Draft banners removed.

**Two judgement calls made, both worth a second look:**
- **No street address published anywhere on the site**, so "Beaudesert, Queensland, Australia"
  (locality-level, from the site's own copy) is used rather than inventing one. Normal for a
  privacy policy — the contact email is the operative APP requirement — but swap in a full
  registered address if you'd rather.
- **5-year retention** reflects general ATO record-keeping guidance, not advice specific to this
  business. It's the single line most worth an accountant confirming.

**Kept separate from the existing marketing-site policies** at `/privacy.html` and `/terms.html`
deliberately: those cover the website contact form only and name none of the app's
subprocessors, GPS, or job photos — pointing a Play Store listing at them would understate what
the app collects. Both in-app pages now cross-link to the website ones.

**Left to close this card out (needs you, not more code):**
1. ~~Fill in the bracketed fields~~ — done 07-08-2026. Optional: confirm the 5-year retention
   figure with an accountant, and decide whether a full street address is wanted.
2. Confirm the deletion matrix above is what you actually want (especially: is scrubbing-not-
   hard-deleting the profile row sufficient, or does APP compliance require full row deletion
   where no FK dependents exist?).
3. Check `tv-magic`/`fieldbourne`'s custom SMS templates in Franchise Settings and add the
   opt-out line manually if they've overridden the four templates above.
4. Apply `20260806170000_account_deletion.sql` to dev Supabase, then click through both deletion
   flows once for real.
5. Only then: move to `done`, add the Shipped row in `ROADMAP.md`.
