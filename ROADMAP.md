# FieldBourne Roadmap — Master

> ## ⚠️ SUPERSEDED 06-08-2026 — read [DUE_DILIGENCE_REVIEW.md](DUE_DILIGENCE_REVIEW.md) first
>
> An independent end-to-end technical and product due diligence review was run on 06-08-2026 (v1.1.154) and **adopted by the owner as the governing roadmap**. It supersedes the tier ordering below.
>
> **What changed:** the Critical list (`dd1`–`dd6`, `dd13` on the Kanban board) comes before all Tier 1/2/3 work. **Tier 3 is frozen** — no T3.x item may be promoted or built until five paying strangers exist (`dd13`). No new feature work while `dd1` (observability) is open.
>
> **This document remains authoritative for:** the shipped log, the T1.x/T2.x specs and their "done when" criteria, and the strategy anchor — all of which the review builds on rather than replaces. Sessions should read both.

| Field | Value |
|-------|-------|
| **Purpose** | The single prioritised roadmap for FieldBourne. Three tiers: keep the current client, become sellable to strangers, nice-to-have. |
| **Status** | **Superseded for prioritisation** by [DUE_DILIGENCE_REVIEW.md](DUE_DILIGENCE_REVIEW.md) (06-08-2026). Still governing for specs + shipped history. Supersedes ordering in `MUST_HAVE_8_ROADMAP.md` and `SALES_PIPELINE_BACKLOG.md` (those remain as detailed specs, referenced below) |
| **Created** | 18-07-2026, from four reviews run that day: full-code inventory, mobile UX/churn review, competitive assessment vs ServiceM8/Tradify, tech-debt re-validation |
| **Last updated** | 11-08-2026 — T1.14 per-technician job exclusions deployed (v1.1.171), inert until the owner applies the migration and enables `assignment_exclusions`. Also shipped 11-08-2026: dd18 dead-code cleanup + parked social posting removed (v1.1.170), freeing a Vercel function slot (now 11/12). Prior: 10-08-2026 — **Critical list `dd1`, `dd3`, `dd4`, `dd5`, `dd6`, `dd7`, `dd8` shipped to production (v1.1.167), verified against real preview/prod data, not just tests.** Also shipped: a quote-send reliability fix, and a fix for a live prod bug found while verifying dd8 (follow-up cron re-notifying the same leads every 15 minutes since 07-07-2026 — 29,825 duplicate notifications, 88 stale leads). `dd2` (Vercel/Supabase Pro) and `dd9` (CSP) remain open — both genuinely blocked (real money; a week of live-traffic data respectively), not skipped for convenience. See Shipped log below for detail per item. Prior: 06-08-2026 due diligence review adopted as governing; 31-07-2026 T1.11 Facebook Lead Ads intake shipped. |

## Governance (read first, every session)

0. **[DUE_DILIGENCE_REVIEW.md](DUE_DILIGENCE_REVIEW.md) sets priority order as of 06-08-2026.** Work its Critical list (`dd1`–`dd6`, `dd13`) before anything below. Tier 3 is frozen until `dd13` completes. Its "Rules for now" section applies to every session.
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

### [~] T1.10 Turn on the built Stage-3 acknowledgment for the client — PARTIAL, discovered live 31-07-2026

- **Why:** Instant customer ack SMS/email + manager new-lead alerts are fully built and shipped dark. The enable migrations already exist in the repo (`supabase/migrations/20250714120000_fieldbourne_stage3_ack.sql`, `20250714130000_lead_ack_email_switch.sql`) but were never run against prod. This is finished value the client isn't getting — and it's the first beat of the sales wedge.
- **Correction (31-07-2026):** checked prod directly while shipping T1.11 — `lead_ack_sms` and `manager_new_lead_alerts` are **already `true`** for brand `tv-magic` (id `b0000000-...-0001`), enabled out-of-band at some point with no roadmap/memory record of it. Only `lead_ack_email` is still `false`. Brand slug question is resolved: prod has exactly two brands, `tv-magic` ("TV Magic") and `fieldbourne` ("FieldBourne Digital") — the client's org is `default` / "TV Magic South Brisbane" under the `tv-magic` brand.
- **Spec:** Decide whether to enable `lead_ack_email` too (left off 31-07-2026, owner's call — no urgency stated). UAT = `SALES_PIPELINE_BACKLOG.md` 3.7: SMS in → customer ack + manager push <60s — **not yet actually run/confirmed on prod** despite the switches being on. Reconcile backlog Stage 3 checkboxes while there.
- **Feature switch:** uses existing `lead_ack_sms` (on) / `lead_ack_email` (off) / `manager_new_lead_alerts` (on).
- **Done when:** Stage 3 UAT passes on prod for `tv-magic`/`default`; backlog updated; `lead_ack_email` decision made and applied.

### [~] T1.11 Facebook Lead Ads intake (added 31-07-2026, owner request — client now running FB Ads) — deployed, awaiting Make.com + UAT

- **Why:** The client started Facebook Ads and is hand-copying leads out of Meta Leads Center — 11 sitting unworked at time of request. Speed-to-lead is the product's whole pitch, so leads ageing in Meta is the worst possible failure. `handleInboundFacebookLead.ts` already does the full pipeline (dedup → Claude extraction → manager alert → ack SMS → auto-assign → workflow run) and `/api/inbound-facebook-lead` is already routed in `vercel.json` — no new function slot needed.
- **Spec:** Accept an optional `source` discriminator on the existing endpoint body (`messenger` default, `lead_ads`) so ad leads store `source: facebook_lead_ads` / `lead_source: 'Facebook Lead Ads'` instead of being mislabelled as Messenger — reporting normalises on `lead_source` (`20250630120000`, `20250702150000`), so without this, ad spend ROI is unmeasurable. Bridge = Make.com free tier (instant Facebook Lead Ads trigger → HTTP module; Zapier's webhook action is a premium app, Make's HTTP module is not). Extraction prompt and fallback parser get a lead-form-shaped variant (form answers, not free text). Setup doc alongside `docs/BOTPRESS_FACEBOOK_LEAD.md`.
- **Feature switch:** new per-brand `inbound_facebook_ads` (default off, category `lead_intake`), gating the server path — not just UI. Separate from `inbound_messenger` so either channel can run alone.
- **Shipped 31-07-2026 (v1.1.148):** deployed to prod, migration applied (was already applied out-of-band before this deploy — not tracked in `supabase_migrations`), switch enabled for `tv-magic`. Ack SMS + manager push will fire on new Lead Ads leads (T1.10 partial-live above); email ack won't (`lead_ack_email` off).
- **Backfill:** none built. The existing 11 go in via Add Lead by hand (owner decision, 31-07-2026); webhooks are forward-only.
- **Remaining:** Make.com scenario build (needs Nick's Facebook Page connected in Make with Leads Access — owner/Nick action) using `org: "default"` in the request body; real-form UAT once Make is live. Owner deferred a synthetic curl UAT (31-07-2026) since it would fire a real ack SMS + manager push.
- **Done when:** a real Lead Ads form submission lands as an unassigned lead attributed to "Facebook Lead Ads" within a minute, and the switch off means the endpoint rejects it.
- **Later (not this item):** native Meta `leadgen` webhook to drop the Make dependency — needs `leads_retrieval` app review and per-org page tokens. Shares infrastructure with T3.5.

### [ ] T1.12 Self-hosted Web Push — own the notification delivery path (added 06-08-2026, owner request — OneSignal judged unstable)

- **Why:** Push is how the client learns a lead arrived, and speed-to-lead is the entire product pitch — a missed push is the worst failure mode we have. OneSignal is only a *relay*: our server calls its REST API, it holds the browser subscriptions and forwards to FCM / Mozilla autopush / Apple. Every reliability problem lives in that extra hop plus its SDK/SW layer. The owner wants the notification to come from the app itself where possible. Audit (06-08-2026) also found a likely live double-notification bug: `public/OneSignalSDKWorker.js` does `importScripts('/sw.js')`, so our own `push` listener at `public/sw.js:18` and OneSignal's share one SW global and **both fire on every OneSignal push** — the second renders a generic "TVMagic / New notification" with no subscriber behind it.
- **Spec:** VAPID + the W3C Web Push protocol against our own `push_subscriptions` table — the same thing OneSignal does internally, minus the middleman. Sender is `api/_lib/webPush.ts` (lazy `import('web-push')`, mirroring the `import('resend')` pattern) called in-process by the existing hubs — **no new file under `api/`**, the Hobby cap is at 12/12. Subscribe/unsubscribe go client → Supabase direct via RLS (users are authenticated, `profiles.id` = `auth.users.id`), so they cost zero function slots; only the SW's session-less `pushsubscriptionchange` needs a `?action=push-rotate` on `send-sms.ts`, authorised by possession of the unguessable old endpoint. `api/_lib/pushTransport.ts` routes on the switch and **falls back to OneSignal per-recipient when a user has no live subscription**, so flipping the switch cannot black out anyone who hasn't reopened the app. Harden the half-built `public/sw.js` handlers (marker-gate against OneSignal payloads, FieldBourne branding, try/catch so a malformed payload never renders nothing, focus-then-`navigate` so deep links survive an open tab). `supabase/functions/notify-message/index.ts` calls the Vercel sender over `?action=push-send` rather than porting `web-push` to Deno. Delete nothing OneSignal yet — teardown is T1.13.
- **Feature switch:** new per-brand `native_web_push` (default off, category `team_operations`, min_tier basic), gating the server transport choice — not just UI. Rollback is one toggle in Platform Admin.
- **Done when:** with the switch on for a brand, a lead assignment delivers to a fully-closed Android Chrome PWA within 10s and the tap lands on the payload's URL; an installed iOS PWA receives it backgrounded; 404/410 responses delete their subscription row; a recipient with no subscription still gets the OneSignal push; and with the switch off delivery is byte-for-byte unchanged.
- **Unlocks:** `src/lib/oneSignal.ts:7-12` hard-disables OneSignal outside two production origins, so preview deploys have never had push at all. Web Push works on any HTTPS origin — preview UAT becomes possible for the first time.
- **Later (not this item):** T1.13 OneSignal teardown once the subscription table plateaus — remove `react-onesignal`, `public/OneSignalSDKWorker.js`, both `ONESIGNAL_*` env vars, and the three REST call sites.

### [~] T1.14 Per-technician job exclusions — "this person cannot do X" (added 11-08-2026, owner request — client has a tech who cannot do Starlink) — deployed v1.1.171, awaiting migration + switch-on

- **Why:** Auto-assign treats every technician as interchangeable. `api/_lib/teamInboundLead.ts` filters on exactly four things — role, `is_hidden_test_profile`, a same-day `Leave` event, and active workload — then `shared/teamAutoAssign.ts` picks min-workload → nearest → oldest profile. There is no concept of skill, capability or exclusion anywhere in the codebase. So a Starlink enquiry can land on the one tech who cannot do Starlink: they get the assignment SMS, the 4-hour timer starts, and the lead ages until a human notices. That is precisely the speed-to-lead failure the product exists to prevent, caused by our own routing.
- **Spec:** A `text[]` of exclusion keywords per person (`profiles.excluded_service_keywords`), matched **case-insensitively against the inbound text, not against `service_type`.** Two constraints force that: (1) `leads.service_type` is free text with no catalog, no enum and no CHECK — the three hardcoded lists live inside Claude prompt strings and none contains "Starlink", which classifies as `"Other"` today; (2) auto-assign runs *inside* `insertRawFirstLead` **before** Claude extraction resolves `service_type`, so anything keyed on that column reads the raw-first placeholder. Haystack = `service_type` + `details` + `raw_sms`/`raw_email`. Pure matcher in `shared/serviceExclusions.ts` with vitest cover. Filter is applied to **both** the tech and manager lists before `selectAssignmentPool`, so the existing empty-pool early return delivers the chosen fallback for free: when everyone is excluded the lead stays `unassigned` in the pool and the normal manager new-lead alert fires — it is never assigned to someone who cannot do it. Manual assign (`AssignLeadModal`) warns rather than blocks: red badge, sorted last, inline confirm — a manager may know the flag is stale. Manager UI extends the Team Management card on `ProfilePage`, which today holds only "+ Create New Employee Account" and lists no existing employees at all. Writes go through `?action=set-exclusions` on the `create-user` hub because `profiles_update_self` RLS restricts updates to `id = auth.uid()` — a manager cannot write another profile's row from the client, and the Hobby function cap is at 12/12.
- **Feature switch:** new per-brand `assignment_exclusions` (default off, category `team_operations`, min_tier basic), gating the server auto-assign filter — not just the UI badges. Noted tension: this makes the catalog 33 switches while `dd19` ("cut the switch catalog to twelve") is open backlog. Owner chose the switch anyway on 11-08-2026 so exclusions can be disabled independently of `inbound_auto_assign`.
- **Done when:** with the switch on, an inbound SMS reading "Starlink installation plus wifi extender" assigns to someone other than the excluded tech *even when that tech has the lowest workload and is nearest*; "TV aerial not working" still assigns to them; excluding every tech and manager leaves the lead unassigned with the manager alert fired and no assignment SMS sent; and with the switch off routing is byte-for-byte unchanged.
- **Shipped 11-08-2026 (v1.1.171):** deployed to prod (`readyState: READY`), 593 tests green, hubs smoke-checked (`create-user` 405, `?action=set-exclusions` 401). **Inert until the owner acts:** `isFeatureEnabledForOrg` returns `catalogRow?.default_enabled === true`, so with no catalog row the feature is hard-off — deploying ahead of the migration is safe by construction. Note for the next session: the `src/lib/features.ts` half of this change leaked into the v1.1.170 social-posting commit without its `shared/featureSwitchCatalog.ts` counterpart, breaking that build (`TS2741`); it was reverted in `e347b25` and restored here. A switch key must always land in **both** files in the same commit.
- **Remaining:** owner to apply `supabase/migrations/20260811120000_assignment_exclusions.sql` to prod via the Management API, then enable `assignment_exclusions` for `tv-magic` in Platform Admin and set the affected tech's keyword. UAT: a Starlink enquiry must route past them even when they are lowest-workload and nearest.
- **Later (not this item):** pool pickup bypasses the check — `src/lib/leadPoolPickup.ts` self-assigns the actor on *any* status change out of `unassigned`, so an excluded employee can still pull the lead off the board by dragging it. Closing that means threading the check through the drag and status-menu paths. Solo mode always assigns the owner and is not covered. The semantic fix — a real service-type catalog, for which the unused `brands.ai_config.service_types` seed and the orphaned `LeadFilterBar.tsx` are the natural seams — is a much larger item this one does not block.

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

- [x] **T3.1 Xero live sync (OAuth, push invoices/contacts).** Shipped v1.1.144 (23-07-2026). OAuth connect + date-range push of sent ACCREC invoices (tax inclusive); feature switch `xero_live_sync`. Not full two-way accounting sync — payments/contacts pull still deferred. CSV export remains.
- [ ] **T3.2 Compliance certificates / forms** (electrical safety, plumbing compliance, gas). Legally required paperwork for licensed trades — its absence excludes sparkies/plumbers/gasfitters from the market entirely. Promote when targeting those trades.
- [ ] **T3.3 Recurring jobs** (maintenance contracts, test-and-tag). Exists even in ServiceM8's free tier; matters the moment a prospect does repeat servicing.
- [ ] **T3.4 Timesheets + job costing / materials.** Tradify Pro / ServiceM8 Premium territory; needed for the 2–10-person team market more than for solos.
- [ ] **T3.5 Native Meta Messenger webhook + hybrid bot.** Finish `api/_lib/metaWebhook.ts` (currently logs + TODO) to remove the Botpress/Make dependency from the FB lead path. Until then the Botpress path is the supported one.
- [x] **T3.6 Social posting: revive or remove.** Removed (decision: delete). Dropped `SocialPage`, Zernio `api/social-post`, caption generation, and the Pro `social` tier gate — frees a Vercel function slot.
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
| 23-07-2026 | T3.1 Xero live sync | v1.1.144. OAuth connect (`api/xero.ts`) + Franchise Settings panel; push sent invoices as tax-inclusive ACCREC; org token columns + `xero_invoice_id` markers; feature switch `xero_live_sync` (default off). Unit-tested payload + OAuth state. **Live Demo Company UAT needs XERO_CLIENT_* env + free Xero account.** |
| 31-07-2026 | T1.11 Facebook Lead Ads intake (PARTIAL) | v1.1.148. `channel: "lead_ads"` discriminator on `handleInboundFacebookLead.ts`/`/api/inbound-facebook-lead`; new per-brand `inbound_facebook_ads` switch, enabled for `tv-magic` (org `default`); lead-form-shaped extraction + retry path. Typecheck + suite clean (503 tests). While shipping, found `lead_ack_sms`/`manager_new_lead_alerts` already `true` for `tv-magic` in prod (T1.10 partial, undocumented). **Remaining: Make.com scenario build (owner/Nick, needs FB Page access) + real-form UAT — deliberately not simulated via curl to avoid firing a real ack SMS/manager push.** |
| 10-08-2026 | dd1 Observability — Sentry + PostHog | v1.1.167. Sentry (client + all 12 serverless functions via a shared `withObservability` wrapper — no new `api/` file) + PostHog, 12 named events, PII scrubbed at the type level (`assertNoForbiddenKeys`). Verified live: deliberate client + server errors landed in Sentry within a minute, breadcrumbs empty; `login` confirmed clean in PostHog. `posthog-node`’s `client.flush()` found to hang indefinitely in this environment — fixed with a 3s timeout guard + `@vercel/functions` `waitUntil`. |
| 10-08-2026 | dd3 Privacy, terms, account deletion | v1.1.167. In-app + public account-deletion flows; Privacy/Terms pages with real business details (FieldBourne Digital, ABN 22 324 219 568); SMS opt-out line on 4 automated templates. Owner-tested deletion on preview — surfaced a real bug: `events.user_id` was `ON DELETE CASCADE`, so deleting a staff account was deleting their customer bookings. Fixed (SET NULL) and applied to prod alongside this card’s own migration. |
| 10-08-2026 | dd4 Fix broken rate limiting | v1.1.167. Postgres-backed atomic limiter (`increment_rate_limit` RPC) replacing 6 broken `Map()` copies (audit found 4) + protecting 5 previously-open public endpoints. Verified under real concurrency on preview: 50 parallel requests to one endpoint counted to exactly 50 with zero lost updates. Migration applied to prod. |
| 10-08-2026 | dd5 Close the open LLM proxy | v1.1.167. Generic `messages`-passthrough Claude proxy replaced with two purpose-built actions + a per-org monthly token ceiling. Smoke-tested on preview against a real Anthropic key — extraction works, not falling back to regex. Migration applied to prod. |
| 10-08-2026 | dd6 Real app icon | v1.1.167. Owner supplied a real FieldBourne logo; generated proper 192/512/maskable variants (`sharp`, safe-zone padding on the maskable one) and wired into the manifest, favicon, apple-touch-icon, and the login screen. Deleted `fieldbourne-logo.png`, byte-identical to the client’s TV Magic logo. |
| 10-08-2026 | dd7 Code-split the routes | v1.1.167. Field-tech entry-path bundle cut 40% (520kB → 312kB gzip) via `React.lazy` on Reports/Calendar/Social/OrgSettings/PlatformAdmin/public quote-invoice pages. Short of the card’s <250kB target — remainder is `@dnd-kit`/`canvas-confetti` baked into `LeadsPage.tsx` itself; owner accepted the win rather than blocking on the `dd14` decomposition. |
| 10-08-2026 | dd8 Collapse the auth round trips | v1.1.167. `authenticateRequestDetailed` 4 DB round trips → 2 via a single PostgREST embedded select. A quote-send failure during owner testing was initially suspected to be this card — verified the exact query directly against **prod** schema (not just dev) before ruling it out; the real cause was unrelated (see quote-send fix below). |
| 07-08-2026 | Quote send blocks on delivery | v1.1.167. `createQuote` was awaiting Resend/Twilio inline before responding; a slow provider read as "couldn’t reach server" on a quote that had already saved, risking duplicate sends. Now races delivery against a 3.5s budget — fast sends report real status unchanged, slow ones hand off to `waitUntil` and the client shows "Quote saved, still sending." Verified on preview: real "Quote email sent" on the fast path. |
| 11-08-2026 | T1.14 Per-technician job exclusions (PARTIAL) | v1.1.171. `profiles.excluded_service_keywords` + word-prefix-anchored matcher (`shared/serviceExclusions.ts`, 21 tests) filtering **both** the tech and manager lists before `selectAssignmentPool`, so the manager fallback can never receive an excluded lead and an all-excluded pool leaves the lead unassigned rather than misassigned. Matched against the inbound text, not `service_type` — that column is free text with no catalog ("Starlink" files as `"Other"`) and auto-assign runs before Claude extraction resolves it. Manual assign warns + confirms rather than blocks. Writes via `?action=set-exclusions` on the `create-user` hub, since `profiles_update_self` RLS blocks a manager from editing a team member's row. New per-brand `assignment_exclusions` switch, default off. 593 tests green, hubs smoke-checked live. **Remaining: owner to apply the migration and enable the switch — inert until then.** |
| 10-08-2026 | Follow-up cron notification flood (prod bug) | v1.1.167. Found while verifying dd8: the follow-up reminder re-matched every stale lead on every 15-min cron run forever (never advanced past 6h staleness). Prod: 29,825 duplicate notifications since 07-07-2026, 88 stale leads (oldest 40 days), intermittent cron 504s that silently skipped invoice/quote chases. Fixed with a reminder cooldown column + a 14-day (owner-set) elapsed-time auto-lost rule + 30-day notification retention. Bulk-cleared 71 leads on prod (18 later restored after the threshold moved from 7→14 days), all migrations verified on prod before the code deploy. |
