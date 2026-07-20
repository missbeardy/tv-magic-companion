# FieldBourne Roadmap — Master

| Field | Value |
|-------|-------|
| **Purpose** | The single prioritised roadmap for FieldBourne. Three tiers: keep the current client, become sellable to strangers, nice-to-have. |
| **Status** | Governing document — supersedes ordering in `MUST_HAVE_8_ROADMAP.md` and `SALES_PIPELINE_BACKLOG.md` (those remain as detailed specs, referenced below) |
| **Created** | 18-07-2026, from four reviews run that day: full-code inventory, mobile UX/churn review, competitive assessment vs ServiceM8/Tradify, tech-debt re-validation |
| **Last updated** | 20-07-2026 — Tier 2 shipped (v1.1.140) except prod schema reconcile operator step; T1.10 still deferred |

## Governance (read first, every session)

1. **This doc governs what gets built.** If a session is asked to build something not listed here, push back, get explicit owner confirmation, and add it to a tier (same block format, dated) *before* writing code.
2. **One item per session** unless items are explicitly marked as bundleable. Work top-down within a tier unless the owner reorders.
3. **Standing conventions apply to every item:** ask whether a per-brand feature switch is needed (switches gate server endpoints, not just UI); bump `src/lib/changelog.ts` + `package.json`; update + version-bump `docs/SALES_PIPELINE_WORKFLOW.md` for any pipeline behaviour change; pure logic goes in `src/lib/`/`shared/` with vitest tests.
4. **"Current state" notes were verified 18-07-2026.** Re-verify cited paths/lines at build time — trust the reasoning, verify the file claims.
5. When an item ships: tick it, add a row to the Shipped log at the bottom, update **Last updated**.

## Strategy anchor (why the tiers are ordered this way)

- **The current client** (Nick — TV Magic South Brisbane, the only real production org) uses this daily **in the field on a phone**. The UX review found the top churn risks are all *silent write failures on the money path* — the app sometimes loses completions, notes, and status changes on weak signal while telling the user it succeeded. Tier 1 is almost entirely "every write confirms or queues."
- **The sellable wedge** (competitive review) is **"never lose a lead"**: missed enquiry → auto-SMS → parsed lead with countdown → quote → e-sign → booked, automatically. Neither ServiceM8 ($29/mo, unlimited users, free tier) nor Tradify (Xero sync on every plan) does this, and it sidesteps data-migration fear by being sellable as a front-door layer *beside* an incumbent tool. Tier 2 is finishing that wedge plus everything a stranger needs to trust and start using the product.
- **Tier 3** is market-expanding or positioning-dependent (e.g. live Xero sync only becomes a must if we pitch as a full ServiceM8 *replacement* rather than a front-door add-on — see T2.9).

---

## Tier 1 — Current client retention

*Theme: nothing the tradie does in the field may fail silently. Fix reliability before adding anything.*

### [x] T1.1 Reliable job completion (offline + failure-aware) — shipped v1.1.130 (18-07-2026)

- **Why:** #1 churn risk. Completing a job offline fires confetti, closes the checklist, then the Supabase update fails with no error check, no queue, no message (`src/pages/LeadsPage.tsx:589-609`, `src/components/CompletionChecklist.tsx:110`). Lead stays `booked`; discovered days later as "the app lost my job."
- **Spec:** Extend the proven offline queue (`src/lib/offlineQueue.ts` / `flushOfflineQueue.ts`) with `completion` and `lead_note` item types via a shared write-or-enqueue helper. Replay guard: re-read lead status before replaying a completion; skip-and-log if already completed/lost. Confetti and "done" UI only after a confirmed write **or** a confirmed enqueue ("Saved — will sync"). Detailed spec: `MUST_HAVE_8_ROADMAP.md` **Package 7** (this item is its core; the mobile-usability pass in that package folds into T1.6/T1.8).
- **Feature switch:** none — reliability is baseline (per Package 7 spec).
- **Done when:** DevTools-offline: complete job + add note → banner shows queued → reconnect → auto-flush → lead completed, events tagged `source: 'offline_queue'`; conflict case double-completion is skipped with a log.

### [x] T1.2 Weak-signal write resilience (timeouts + error surfacing on every lead write) — shipped v1.1.131 (18-07-2026)

- **Why:** Offline detection is `navigator.onLine`-only, so one-bar 3G bypasses the queue entirely, and many writes are fire-and-forget with no error check: status menu (`src/components/LeadStatusMenu.tsx:140`), unassign (`LeadsPage.tsx:866-877`), call/SMS status bumps (`LeadsPage.tsx:685-702, 787-817`). Failed writes evaporate — timers never start, pool pickups never land. Separately, sends have no timeout: "Sending…" can hang forever with Cancel disabled (`InvoiceStep.tsx:144-163`, `QuoteComposerModal.tsx:154-181`, `src/lib/reviewRequest.ts:85-94`).
- **Spec:** (a) Every lead/status write checks its result; on failure show a retry toast and, where the queue supports the type, enqueue instead. (b) `AbortSignal.timeout(~10s)` on all fetches; on timeout, an actionable error ("Couldn't send — retry / will retry when online"), never a raw `Failed to fetch`. (c) Treat a network *failure* (not just `!navigator.onLine`) as the enqueue trigger in the write-or-enqueue helper from T1.1.
- **Feature switch:** none.
- **Done when:** throttled-3G + request-blocked tests show no silent losses across call, status change, unassign, invoice send, quote send.

### [x] T1.3 Photo flow overhaul — shipped v1.1.132 (18-07-2026)

- **Why:** Photos are the tradie's dispute evidence. Today they only exist on `completed` leads (no before/mid-job shots — gates at `LeadCard.tsx:382`, `LeadDetailSheet.tsx:293-306`), failed uploads are silently skipped (`LeadPhotos.tsx:118` — `continue` with no error state), share/delete are hover-only and unreachable on touch (`LeadPhotos.tsx:176-191`), UI caps at 3 photos, and raw ~10 MB photos upload uncompressed on 3G.
- **Spec:** Allow photos on any active lead status (assigned/booked onward). Surface per-file upload failures with a retry affordance; a failed upload must never disappear. Always-visible touch controls (no hover gating). Raise the visible cap to match the offline queue's 10. Client-side downscale/compress before upload (canvas re-encode, ~1600px/80%). Keep signed-URL privacy model unchanged.
- **Feature switch:** none (existing capability, made trustworthy).
- **Done when:** before-photos possible on a booked job; a blocked upload shows an error + retry and survives app restart via queue; all controls operable one-thumbed.

### [x] T1.4 Offline read cache (see today's jobs with no signal) — shipped v1.1.133 (18-07-2026)

- **Why:** The offline banner claims "showing cached schedule" but no data caching exists — offline, the leads page says "Could not load leads. Please refresh." (`OfflineBanner.tsx:11`, `LeadsPage.tsx:272-277`; PWA precache is static assets only). "Can't see the address when I pull up" is a churn story.
- **Spec:** Persist the last successful leads fetch + today's/tomorrow's calendar events per user (IndexedDB, reuse the offline-queue DB). On fetch failure, render cached data read-only with a "showing saved copy from HH:MM" banner. Fix banner/error copy to match reality. Writes on cached data go through the T1.1/T1.2 helper. Explicitly not a sync engine — cache-on-read only.
- **Feature switch:** none.
- **Done when:** airplane mode → open app → today's jobs, customer names, phones, addresses all visible; call button still works (queues the attempt).

### [x] T1.5 Frictionless calling — shipped v1.1.134 (18-07-2026)

- **Why:** Calling is the highest-frequency action and every call is gated by a `window.confirm` explaining CRM status semantics (`LeadsPage.tsx:662-667`; offline path is two dialogs), and the sheet's call button is ~34px (`LeadContactEditor.tsx:135-142`).
- **Spec:** Remove the confirm; open the dialer immediately and apply the status bump optimistically with a brief undo toast ("Marked contact attempted — Undo"). Offline copy becomes a passive toast, not an alert. Call/SMS targets ≥44px.
- **Feature switch:** none.
- **Done when:** card → sheet → call is two taps, zero dialogs, and the status write obeys T1.2 rules.

### [~] T1.6 Completion ceremony: drafts + fewer forced steps — PARTIAL, shipped v1.1.135 (18-07-2026)

> **Shipped:** (a) draft-resume of the completion ceremony + trade-neutral default checklist labels.
> **Deferred (own follow-up):** (b) org-configurable checklist via Franchise Settings (needs an `orgs` column migration + a settings CRUD panel), and (c) SMS delivery of the public invoice link when the customer has no email (needs a new server SMS action + email-optional invoice creation). Both add DB/server surface best done as a focused change, not folded into this UX-reliability batch.


- **Why:** Closing a job is 8–10 interactions with mandatory typing and **no draft protection** — the only major flow without the localStorage draft pattern (`addLeadDraft.ts`/`quoteDraft.ts`/`eventModalDraft.ts` all have it). A mid-flow phone call that reloads the PWA restarts the ceremony from zero. Checklist labels are hardcoded TV-installer items (`CompletionChecklist.tsx:17-29`); invoice **requires** a typed email (`InvoiceStep.tsx:135-138`) even though a public invoice page exists.
- **Spec:** (a) Draft-persist checklist + invoice + review step state per lead (same debounced-localStorage pattern), restored on reopen. (b) Checklist items become org-configurable (Franchise Settings; seed current labels as default), with a sensible minimum ("work completed" always required). (c) Invoice without email: offer SMS delivery of the public `/invoice/:token` link when the lead has a phone; email becomes optional-if-present.
- **Feature switch:** none for drafts; confirm at build whether configurable checklist needs one (leaning no — org setting, not behaviour toggle). SMS invoice delivery must respect existing `one_tap_invoice` gating server-side.
- **Done when:** kill the app mid-ceremony → reopen → resume where you left off; complete + invoice a customer with no email using only their mobile number.

### [x] T1.7 Booking save resilience — shipped v1.1.136 (18-07-2026)

- **Why:** `EventModal.handleSave` awaits up to ~8 serial network calls (lead write, events, notifications, SMS, booking-confirm) behind one "Saving…" with no timeout, surfacing raw fetch errors (`EventModal.tsx:599-886`); it's a centered desktop-style modal with a 28px close button on mobile (`EventModal.tsx:921-942`).
- **Spec:** Save = lead write + event insert only, awaited with timeout; everything else (notifications, SMS, booking-confirm, event logs) fires in the background after confirmed save, individually error-logged, never blocking modal close. Human error copy on failure (drafts already make it recoverable). Mobile: render as bottom sheet (reuse `BottomSheet.tsx`), ≥44px close.
- **Feature switch:** none.
- **Done when:** booking on throttled 3G confirms in <3s of perceived wait; a dropped notification call never blocks or fails the booking.

### [x] T1.8 Tap-target pass on the money path — shipped v1.1.137 (18-07-2026)

- **Why:** The smallest targets sit on the highest-frequency controls: status pill ~24px with 36px dropdown rows where a slip turns "Booked" into "Lost" — silently, per the old write behaviour (`LeadStatusMenu.tsx:78-81, 235-247`; `LeadCard.tsx:232-246, 286-295`); modal close buttons ~28px. The app already knows the rule — `LeadDetailSheet` and `QuoteComposerModal` use `min-h-[44px]`.
- **Spec:** ≥44px on: status pill trigger, status dropdown rows, card next-action CTA, EventModal/AddLeadModal close buttons. Destructive statuses (Lost, Booking cancelled) get a lightweight confirm *in the dropdown flow only* (this is the one place confirm is warranted).
- **Feature switch:** none.
- **Done when:** audit pass shows no interactive money-path element under 44px; "Lost" cannot be committed by a single mis-tap.

### [x] T1.9 Fix the dead assignee push (push-notify scaffold) — shipped v1.1.138 (18-07-2026)

- **Why:** `supabase/functions/push-notify/index.ts` is unmodified scaffold ("Hello from Functions!") yet `src/lib/sendPush.ts` → `LeadStatusMenu.tsx:179` calls it to notify the assignee on completed/lost — a silent no-op on every such status change.
- **Spec:** Route the call through the existing working OneSignal path (mirror `supabase/functions/notify-message/index.ts`, or reuse the server-side `api/_lib/notifyUser.ts` seam) — pick whichever at build time; then delete the scaffold. Alternatively, if the notification is judged low-value, delete the call and `sendPush.ts` entirely — decide with owner at build.
- **Feature switch:** no new switch; respects existing notification behaviour.
- **Done when:** completing/losing an assigned lead delivers a real push to the assignee (or the dead path is removed), and no scaffold code remains.

### [ ] T1.10 Turn on the built Stage-3 acknowledgment for the client

- **Why:** Instant customer ack SMS/email + manager new-lead alerts are fully built and shipped dark. The enable migrations already exist in the repo (`supabase/migrations/20250714120000_fieldbourne_stage3_ack.sql`, `20250714130000_lead_ack_email_switch.sql`) but were never run against prod. This is finished value the client isn't getting — and it's the first beat of the sales wedge.
- **Spec:** Confirm brand slug targets with owner (migrations target `fieldbourne`/`fieldbourne-dev`; the real prod org is TV Magic South Brisbane — the enable rows likely need the client's actual brand). Apply via the prod Management-API flow. UAT = `SALES_PIPELINE_BACKLOG.md` 3.7: SMS in → customer ack + manager push <60s. Reconcile backlog Stage 3 checkboxes while there.
- **Feature switch:** uses existing `lead_ack_sms` / `lead_ack_email` / `manager_new_lead_alerts`.
- **Done when:** Stage 3 UAT passes on prod for the client's brand; backlog updated.

---

## Tier 2 — Before marketing to strangers

*Theme: finish the wedge, look like a real product, and make onboarding + operations survivable without the founder in the loop.*

### [x] T2.1 Close the loop: quote → book → invoice → pay → review — shipped v1.1.139 (20-07-2026)

- **Why:** This is the product promise and the second half of the 60-second demo. Every hand-off must be automatic or one tap. The one genuinely new automation is **paid → review** (today review requests are 100% manual and fire on completion, never payment).
- **Spec:** Build to `MUST_HAVE_8_ROADMAP.md` **Package 6** (accept→book deep-link with `EventModal` prefill — backlog 4.6/5.1; complete→invoice auto-advance; server-side review-on-paid inside `markInvoicePaid` with dedupe on `review_request_sent_at`). That spec is current — re-verify its file claims at build.
- **Feature switch:** new `auto_review_on_paid` (customer_communication, min_tier basic) per Package 6; confirm at build.
- **Done when:** the full staging run in Package 6's verify section passes end-to-end, exactly once per lead.

### [x] T2.2 The 60-second demo works on demand — shipped v1.1.140 (20-07-2026)

- **Why:** The competitive review's conclusion: the winning pitch is a live demo — missed call → branded SMS → reply parsed into a lead card with countdown → chip quote → e-sign → booked with confirmation SMS — enquiry-to-booked in under a minute on a $300 Android, zero typing.
- **Spec:** A resettable demo org (dev or dedicated prod demo brand) with: all wedge switches on, price-list seeded, a dedicated Twilio number, and a documented reset script (clear leads/events between demos). Rehearse the exact beat sheet from the marketability report; fix whatever stumbles (this item is the integration test for T1.x + T2.1). Document the runbook in `docs/DEMO_RUNBOOK.md`.
- **Feature switch:** none — configuration + runbook.
- **Done when:** the owner can run the full demo cold, twice in a row, from a phone. **Owner UAT still required** (runbook + `scripts/demo-reset.sql` shipped).

### [x] T2.3 Rebrand the shell to FieldBourne — shipped v1.1.140 (20-07-2026)

- **Why:** A stranger installing "FieldBourne" gets a PWA named **TVMagic**.
- **Spec:** Neutral FieldBourne shell branding; per-brand theming continues via the brands table. localStorage: migrate-on-read from `tvmagic:` → `fieldbourne:`. Vercel/repo rename deferred (operational risk).
- **Done when:** fresh PWA install shows FieldBourne name/icon; shell strings are FieldBourne; brand-data TV Magic remains.

### [x] T2.4 In-app onboarding for the bespoke mechanics — shipped v1.1.140 (20-07-2026)

- **Why:** Pool timer and contact rounds fail without training.
- **Spec:** Package 8 coach tips + `onboarding_tips` switch.
- **Done when:** team-mode tips in order; solo sees none; ? replays.

### [x] T2.5 Customer data import — shipped v1.1.140 (20-07-2026)

- **Why:** Migration fear kills switching.
- **Spec:** CSV import via `/api/leads?action=customer-import`, Franchise Settings UI, `customer_import` switch, `customers.notes`.
- **Done when:** messy CSV imports with created/merged/skipped report.

### [x] T2.6 Stranger-ready provisioning: new-org preset + trial path — shipped v1.1.140 (20-07-2026)

- **Why:** New orgs feel empty with switches default off.
- **Spec:** Solo tradie wedge preset at org create; founder-led runbook (self-serve deferred T3.11).
- **Done when:** Platform Admin checkbox applies preset; ONBOARDING_RUNBOOK current.

### [x] T2.7 Production schema reconciliation (+ migration-order hazard) — PARTIAL v1.1.140 (20-07-2026)

- **Why:** Prod not migration-driven; timestamp hazard.
- **Shipped:** `supabase/MIGRATION_ORDER.md`; `production_cutover.sql` marked historical; RECONCILIATION.md still the operator runbook.
- **Deferred (owner-supervised):** live `db diff` / `db push` against prod — requires PITR window.

### [x] T2.8 Engineering hygiene batch — shipped v1.1.140 (20-07-2026)

- **Why:** Due-diligence debt.
- **Spec:** tests typecheck, delete dead modules, shrink FEATURES, real README, backlog reconcile.
- **Done when:** greps clean; typecheck includes tests.

### [x] T2.9 Positioning + pricing decision gate — decided 20-07-2026

- **Decision:** **(a) Front-door add-on** beside the tradie's existing tool. Xero live sync and certificates stay Tier 3. Target solo price **$69/mo AUD GST-inc**, messaging included with fair-use SMS clause; founding customers may be discounted for reviews. Team = higher flat per-org (not per-user). Recorded in ROADMAP + BUSINESS.md.
- **Tier 3 unchanged** — no pull-forward of T3.1/T3.2.

---

## Tier 3 — Nice-to-have / positioning-dependent

*Build only after Tiers 1–2, or when T2.9 or a real customer pulls one forward. Each gets a full spec block when promoted.*

- [ ] **T3.1 Xero live sync (OAuth, two-way invoices/contacts).** The #1 competitive purchase gate *for replacement positioning*; deliberately deferred while positioned as a front-door add-on (CSV export shipped and honest). Promote to Tier 2 if T2.9 chooses "replacement."
- [ ] **T3.2 Compliance certificates / forms** (electrical safety, plumbing compliance, gas). Legally required paperwork for licensed trades — its absence excludes sparkies/plumbers/gasfitters from the market entirely. Promote when targeting those trades.
- [ ] **T3.3 Recurring jobs** (maintenance contracts, test-and-tag). Exists even in ServiceM8's free tier; matters the moment a prospect does repeat servicing.
- [ ] **T3.4 Timesheets + job costing / materials.** Tradify Pro / ServiceM8 Premium territory; needed for the 2–10-person team market more than for solos.
- [ ] **T3.5 Native Meta Messenger webhook + hybrid bot.** Finish `api/_lib/metaWebhook.ts` (currently logs + TODO) to remove the Botpress/Make dependency from the FB lead path. Until then the Botpress path is the supported one.
- [ ] **T3.6 Social posting: revive or remove.** `SocialPage` + Zernio integration is fully built but parked and its server gate never UAT'd. Decide; if removed, that frees a Vercel function slot (`api/social-post.ts`).
- [ ] **T3.7 Supplier catalogs / purchase orders.** Deliberately out of scope for solo service trades (price-list favourites cover them); needed for materials-heavy quoting.
- [ ] **T3.8 Customer-facing live "on my way" tracking** (Uber-style link). On-the-way SMS exists; live tracking is polish.
- [ ] **T3.9 MYOB CSV export variant.** Same builder as the Xero CSV, different column map — build only if a real prospect asks.
- [ ] **T3.10 Cross-device persistence for drafts/onboarding** (profiles-backed instead of localStorage). Documented v2 of the draft + tips systems.
- [ ] **T3.11 Self-serve signup + automated trial.** Deferred from T2.6; only worth building with real inbound demand.
- [ ] **T3.12 Card surcharge option** (`card_surcharge_percent`, capped at cost of acceptance per AU rules). Documented fast-follow from the Pay Now work.

---

## Adding items

New idea (owner or session): add it to the appropriate tier with the same block format (**Why / Spec / Feature switch / Done when**), date it, and note who asked. If it displaces something, say so. Sessions must not build unlisted work — push back and confirm first (see Governance rule 1).

## Shipped log

| Date | Item | Notes |
|------|------|-------|
| 18-07-2026 | T1.1 Reliable job completion | v1.1.130. New `completion`/`lead_note` offline-queue types + shared write-or-enqueue helper (`src/lib/offlineWrites.ts`); completion confetti gated on confirmed save/queue; flush conflict-guard skips already-terminal leads. Unit-tested + typecheck clean. **Browser DevTools-offline UAT still owner-run** (needs live app + real lead). |
| 18-07-2026 | T1.2 Weak-signal write resilience | v1.1.131. `runLeadUpdate` checks every named lead write (status change, unassign, call, SMS); call/SMS status failures queue as contact attempts, others raise a Retry toast (new `src/lib/toast.ts` + `ToastHost`). `fetchWithTimeout` (10s) on invoice/quote/review/notify sends → friendly `NetworkError`, never a raw "Failed to fetch". Unit-tested + typecheck clean. Batched with T1.1 for preview. **Throttled-3G / request-blocked browser UAT still owner-run.** |
| 18-07-2026 | T1.3 Photo flow overhaul | v1.1.132. Photos allowed on active statuses via `canAddLeadPhotos` (new gate in LeadCard + LeadDetailSheet, not just completed); failed online uploads fall back to the offline queue (never lost, retries on sync); Share/Delete always-visible + larger touch targets; cap raised 3→10 (matches `MAX_OFFLINE_PHOTOS`); client-side downscale/re-encode via new `src/lib/imageCompression.ts` (~1600px/80%, graceful fallback). Unit-tested + typecheck clean. Batched with T1.1/T1.2 for preview. **Browser UAT (before-photo on booked job, failed-upload retry, one-thumb controls) still owner-run.** |
| 18-07-2026 | T1.4 Offline read cache | v1.1.133. Generic cache store added to the offline-queue IndexedDB (DB v1→v2); dead `scheduleCache.ts` repurposed into per-user leads/events cache (also removes a `tvmagic_` localStorage key — small T2.3 win). LeadsPage + `useCalendarEvents` save on success, fall back to cache on fetch failure with a "saved copy from HH:MM" stale banner; OfflineBanner copy corrected. Unit-tested + typecheck clean. **Airplane-mode browser UAT still owner-run.** |
| 18-07-2026 | T1.5 Frictionless calling | v1.1.134. Removed the "Call this customer?" `window.confirm` on the call path; dialer opens immediately, status bump is optimistic with an Undo toast (snapshot-based revert). Offline call/SMS prompts converted from `confirm`/`alert` to passive toasts. Call/SMS buttons in LeadContactEditor raised to ≥44px. Reuses T1.2's `runLeadUpdate`/toast. Typecheck clean; logic covered by existing tests. **Two-tap-no-dialog browser UAT still owner-run.** |
| 18-07-2026 | T1.6 Completion ceremony (PARTIAL) | v1.1.135. Draft-resume of the completion ceremony via new `src/lib/completionDraft.ts` (persists step + checkboxes; CompletionChecklist restores on mount, LeadsPage reopens the drafted lead's checklist after load, clears on finish/cancel/terminal). Default checklist labels made trade-neutral. **Deferred:** org-configurable checklist (migration + settings UI) and SMS-invoice-without-email (server action) — see item note. Typecheck + full suite clean. **Kill-mid-ceremony-resume browser UAT still owner-run.** |
| 18-07-2026 | T1.7 Booking save resilience | v1.1.136. EventModal customer booking-confirm moved to a background task after the modal closes (was blocking); both it and the employee booking-SMS wrapped in `fetchWithTimeout` (no indefinite hang); `window.alert` on SMS failure → passive toast. Modal is a bottom sheet on mobile with a ≥44px close. Typecheck + suite clean. **Slow-3G booking UAT still owner-run.** |
| 18-07-2026 | T1.8 Tap-target pass | v1.1.137. Status pill trigger + dropdown rows → ≥44px; destructive statuses (Lost / Booking Cancelled) now confirm in the dropdown; LeadCard next-action CTA, AddLeadModal + EventModal close buttons → ≥44px. Typecheck + suite clean. |
| 18-07-2026 | T1.9 Fix dead assignee push | v1.1.138. LeadStatusMenu completed/lost notification repointed from the unimplemented `push-notify` edge-function scaffold to the working `sendNotification` (`/api/send-sms?action=notify`, OneSignal + in-app bell); deleted dead `src/lib/sendPush.ts`. (Deployed scaffold `supabase/functions/push-notify` now unused — remove via Supabase dashboard when convenient.) Typecheck + suite clean. |
| 20-07-2026 | T2.1 Closed-loop pipeline | v1.1.139. Quote-accept manager notify deep-links to `/calendar?bookLead=` with EventModal prefilled (amount + scope); complete→invoice already auto-advanced when `one_tap_invoice` on; new `auto_review_on_paid` switch + `api/_lib/reviewRequest.ts` fires review SMS from `markInvoicePaid` (Stripe or manual) with `review_request_sent_at` claim-before-send dedupe. Migration `20260720120000_auto_review_on_paid.sql`. Unit-tested guards. **Staging e2e UAT still owner-run.** |
| 20-07-2026 | T2.2–T2.9 Tier 2 batch | v1.1.140. Demo runbook + reset SQL; FieldBourne shell rebrand; onboarding tips; customer CSV import; solo tradie preset at org create; migration-order docs + cutover marked historical (prod reconcile still operator-run); hygiene (dead code, README, tests typecheck, backlog); positioning = front-door add-on @ $69/mo GST-inc messaging-included. |
