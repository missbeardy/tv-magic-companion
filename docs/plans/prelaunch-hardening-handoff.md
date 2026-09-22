# Pre-launch hardening handoff (AUD-1 → AUD-8)

Branch: `release/prelaunch-hardening` (local only — nothing pushed, no PR opened).
Final gate: `npm run typecheck` clean, `npm test` 905/905, `npx vite build` clean
(see the note on `npm run build` below).

## Commits, in order

1. **`02ec838` AUD-1: baseline WIP** — committed the pre-existing untracked WIP
   (5 `api/_lib` files, `leadTransition.ts`/`leadsBoardQuery.ts`,
   `LeadSmsThread.tsx`, 8 tests, 10 migrations) plus 88 pre-existing modified/
   deleted tracked files that were sitting in the working tree. Excluded local
   tool-config directories (`.agents/`, `.claude/`, `.codex/`, `.cursor/`,
   `.impeccable/`, `.github/hooks/`, `skills-lock.json`) as not part of the
   app. All 10 pending migrations turned out to already be live on prod since
   2026-09-16 (six days before this session) — verified via the
   `schema_migrations` ledger and re-run as a no-op confirmation pass, not a
   real change.
2. **`607e6db` AUD-2: lock privileged orgs columns** — `BEFORE UPDATE` trigger
   blocking `authenticated`/`anon` writes to `subscription_tier`,
   `stripe_customer_id`, `stripe_connect_account_id`, `stripe_connect_status`,
   `brand_id`, `slug`, `sms_from_number` unless the caller is a platform
   admin. Uses `IS DISTINCT FROM` so `OrgSettingsPage`'s "reset to brand
   template" (which re-writes the org's own existing `brand_id`) still works.
3. **`9f4cedb` AUD-3: split FOR ALL RLS policies** — `leads`
   (SELECT/INSERT/UPDATE, no DELETE), `lead_events` (SELECT/INSERT only),
   `events` (UPDATE/DELETE require `user_id = auth.uid()` or
   manager/platform_admin). `tasks`/`task_items` were already dropped
   2026-08-11 — nothing to do there, card premise was stale.
4. **`21725b8` AUD-4: close the booking-confirm relay** —
   `handleBookingConfirm` now requires `leadId`, loads the lead via service
   role, 403s on org mismatch, and sources name/phone/email/address/service
   type from the lead row instead of the request body. Client payload
   trimmed to match. No prod SQL (pure app code).
5. **`19eccff` AUD-5: make the Messenger receptionist per-org** — system
   prompt now assembled from `orgs.messenger_business_name` /
   `messenger_contact_phone` / `service_area_note` / `ai_context` /
   `service_types` / `timezone` instead of a hardcoded TV Magic constant.
   Fails closed (skips the AI, logs to `unrouted_inbound`) when
   `messenger_contact_phone` is unset. **Note:** the native Messenger bot has
   never processed a real message in prod (`messenger_sessions` has 0 rows)
   — Botpress is what's actually live on the Page. This card was precautionary
   readiness work, not a live-behaviour fix.
6. **`dda0ab8` AUD-6: extend the profile lock trigger** — added
   `departed_at`, `excluded_service_keywords`, `is_hidden_test_profile`,
   `test_profile_owner_id`, `manager_id`, `email` to the existing
   `prevent_profile_privilege_escalation` trigger. **Caught before shipping:**
   `profiles.email` does not exist on prod — a plain column reference would
   have broken every profile update in prod the instant this trigger ran. The
   email check goes through `to_jsonb()` instead, which no-ops safely when
   the column is absent.
7. **`94e5960` AUD-7: npm audit fix** — react-router-dom 7.16.0→7.18.4, qs
   (transitive)→6.16.0, sharp 0.35.3→0.35.4, vite 8.0.12→8.3.0. All within
   existing semver ranges (`package.json` unchanged). 45→32 vulnerabilities;
   the rest need `--force` (major Vercel tooling bumps) and were left alone.
8. **`496d756` AUD-8: server env validation** — new `api/_lib/env.ts`
   (`missingServerEnv()`) checking `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `TWILIO_AUTH_TOKEN`, `INBOUND_SECRET`, `CRON_SECRET`, `META_APP_SECRET`,
   `RESEND_API_KEY`. `inbound-sms.ts`/`inbound-email.ts` no longer crash at
   module scope when env is missing (`createClient(...!)` → `getSupabaseAdmin()`
   with a controlled TwiML ack / 503 + Sentry capture). `withObservability`
   reports missing vars once per cold start. `cron-maintenance`'s heartbeat
   now includes `missingEnv`.

## Prod SQL files, in apply order

All in `docs/plans/prod-sql/`, each with a read-only verify query at the top.

1. **`AUD-1-pending-migrations.md`** — manifest of the 10 migrations that
   turned out to already be live (see commit 1 above). Nothing to apply;
   documents what's already there.
2. **`AUD-2.sql`** — `prevent_org_privileged_column_change` trigger.
   **Already live on prod** (found in the 22-09-2026 review), but as
   SECURITY DEFINER, which makes it a no-op — see AUD-C1.
3. **`AUD-3.sql`** — split RLS policies on `leads`/`lead_events`/`events`.
   **Already live on prod**, but overridden by 28 legacy permissive policies —
   see AUD-3b. Don't re-run after AUD-3b.
4. *(AUD-4 has no SQL — pure app code.)*
5. **`AUD-5.sql`** — `orgs.messenger_business_name` /
   `messenger_contact_phone` / `service_area_note` columns, widened
   `unrouted_inbound` constraints, and the TV Magic backfill. **Half-applied on
   prod**: columns + `messenger` channel exist, the `not_configured` reason
   does not. Run the part above the BACKFILL marker; hold the backfill.
6. **`AUD-6.sql`** — extended `prevent_profile_privilege_escalation`.
   **Already live on prod**, as a no-op for the same reason as AUD-2.
7. *(AUD-7 has no SQL — dependency bump.)*
8. *(AUD-8 has no SQL — pure app code.)*

### Review follow-ups (22-09-2026) — this is the real apply order

None of the 20260922* migrations are recorded in prod's `schema_migrations`.

1. **`AUD-C1.sql`** — apply **now**, before anything else and independent of
   the deploy. The four column-guard trigger functions were SECURITY DEFINER,
   so `current_user` was always `postgres` and they never blocked anything:
   any signed-in user can currently make themselves `platform_admin`. Flips
   them to SECURITY INVOKER (bodies unchanged). AUD-2.sql / AUD-6.sql and
   their migrations are now INVOKER too, so re-running them can't revert it.
2. **`AUD-5.sql`** — constraint part only (see above).
3. Deploy the branch (ships the `cancelBooking.ts` shared-booking guard).
4. **`AUD-3b.sql`** — drops the 28 legacy permissive policies (anon lead
   inserts, cross-org manager access, hard deletes, cross-org profiles, any
   employee editing org settings) behind a guard that aborts if a replacement
   policy is missing. Also lets a lead's assignee edit events on that lead so
   `leadContact.ts` / `leadAddress.ts` don't silently no-op.

## New env vars

None of these are *new* requirements — `missingServerEnv()` (AUD-8) just
makes the app aware of vars it already silently depended on:

| Var | Already required by |
|---|---|
| `SUPABASE_URL` (or `VITE_SUPABASE_URL`) | Every DB-touching handler |
| `SUPABASE_SERVICE_ROLE_KEY` | Every DB-touching handler |
| `TWILIO_AUTH_TOKEN` | `inbound-sms.ts` Twilio signature check |
| `INBOUND_SECRET` | `inbound-email.ts` CloudMailin basic-auth check |
| `CRON_SECRET` | All `cronActions.ts` handlers |
| `META_APP_SECRET` | Meta webhook HMAC verification |
| `RESEND_API_KEY` | `sendTransactionalEmail.ts` |

Check prod has all seven set (`cron-maintenance`'s heartbeat will now show
`missingEnv` on its next run either way).

## Known gaps carried forward, not part of this audit

- `npm run build`'s `prebuild` script fails on `WEEKLY_CHANGELOG.weekStarts`
  being stale (14-09-2026 vs this week's 21-09-2026) — pre-existing, unrelated
  to any AUD card, out of scope per the "no changelog entry" ground rule.
  Every gate in this handoff used `npx vite build` directly instead; the
  underlying bundle compiles clean.
- `profiles.email` and `orgs.stripe_subscription_id`/`subscription_expires_at`
  are schema drift/gaps noticed along the way but out of this audit's scope
  (see AUD-6 and AUD-2 reports above).

## Agent 2: 🟡 High (AUD-9 → AUD-19), 22-09-2026

Continuation on the same branch. Pre-flight confirmed all 8 AUD-1..AUD-8
commits present, `npm run typecheck` clean, `npm test` 911/911 green before
starting. Gated every commit on typecheck + full suite; ended at 936/936
(124 files). Stopped after AUD-19 per the checkpoint in the brief — AUD-20
onward (🟢 Backlog) not started.

### Commits, in order

9. **`a3c125c` AUD-9: campaign quote + /visualise per-org** — route is now
   `/visualise/:orgSlug`, bare `/visualise` redirects to `/visualise/default`.
   `handleCampaignQuote` takes `orgSlug` (query on GET, body on POST) instead
   of `CAMPAIGN_ORG_SLUG` env, gated by a new `campaign_quote` per-brand
   switch (default off). A new GET branding action on the same handler feeds
   `CampaignBrandProvider`, threading org name/logo/website/primary colour
   through the campaign page in place of "TV Magic" literals.
   `--c-cyan-ink` (button/focus contrast token) stays fixed — not safe to
   hand to an arbitrary brand colour, see `tests/campaignContrast.test.ts`.
   New `orgs.website` column.
10. **`de71caa` AUD-10: remove hardcoded tenant values** — FB/Messenger
    service-type inference falls back to `FACEBOOK_SERVICE_TYPES` when
    `orgs.service_types` is empty. New `SUPPORT_INBOX_EMAIL` and
    `VITE_ONESIGNAL_APP_ID` env vars (fallback to today's literals). Voicemail
    IMAP folder can come from a new `orgs.voicemail_imap_folder` column ahead
    of the env var. All behaviour-preserving until the new vars/column are set.
11. **`c33c1b4` AUD-11: dedupe useTechLocation, poll only while visible** —
    EmployeeDashboard and ManagerDashboard each duplicated App.tsx's
    `useTechLocation` call, so a signed-in tech ran three concurrent
    10-minute geolocation pollers. Removed the two duplicates. The hook now
    starts/stops its interval on `visibilitychange` instead of running in a
    backgrounded tab.
12. **`a207dff` AUD-12: one realtime channel per org for the leads table** —
    new `src/hooks/useOrgLeadsRealtime.ts` keeps a ref-counted registry of one
    `postgres_changes` channel per org, shared across AssignedLeads,
    useLeadsPoolCount, EmployeeDashboard, ManagerDashboard and LeadsPage
    (previously up to 5 concurrent channels, several on static names).
    Fan-out debounced 400ms. ManagerDashboard's separate `lead_events`
    channel (report snapshot) untouched — different table.
13. **`d7a47cf` AUD-13: handle ignored `{ error }` results** — Calendar.tsx
    (delete leave), LeadPhotos.tsx (delete photo — storage + row), ProfilePage.tsx
    (avatar upload swapped the preview in before the DB write even ran),
    NotificationBell.tsx (mark-as-read) now check the error, toast + Sentry
    instead of updating local state on failure. cancelBooking.ts's manager-notify
    insert is Sentry-only (non-fatal by design — the booking cancel itself
    already succeeded by that point).
14. **`e7d67e0` AUD-14: route-level and section-level Sentry error
    boundaries** — new `RouteBoundary` wraps every route element in App.tsx
    (`Sentry.ErrorBoundary`, tag `route:<name>`); new `SectionBoundary` wraps
    Calendar (CalendarPage), LeadDetailSheet (LeadsPage) and the /visualise
    canvas (VisualiserStage) so a crash there doesn't bubble to the route
    boundary and take the page's own NavBar with it. `@sentry/react` v10 has
    no `resetKeys` prop (unlike react-error-boundary) — both use React `key`
    instead (pathname / record id) for the same effect via remount.
15. **`18b6831` AUD-15: leads board drag sensors and column scroll on
    phone** — split `PointerSensor` into `MouseSensor` (8px) + `TouchSensor`
    (250ms delay, 6px tolerance) + `KeyboardSensor`, so a touch scroll over a
    card no longer gets hijacked as a drag start. Column height changed from
    `max-h-screen` to `max-h-[calc(100dvh-10rem)] overscroll-contain` with
    safe-area bottom padding.
16. **`d664c82` AUD-16: rate limiter fail-closed, real client IP,
    constant-time cron auth** — `checkRateLimit` takes an optional
    `failClosed` (default false everywhere else), applied to campaign-quote
    and the public quote/invoice/push/account-deletion actions in
    send-sms.ts. `rateLimitIdentifier` now prefers `x-real-ip`, then
    `x-vercel-forwarded-for`, then `x-forwarded-for` (all 8 call sites
    updated). `isCronAuthorized` uses `safeCompareSecret` (constant-time)
    for both the Bearer token and `x-cron-secret`. The
    `increment_rate_limit`/`increment_ai_usage` REVOKE/GRANT this card also
    asks for was **already shipped** pre-baseline
    (`20260916130000_lock_counter_rpcs.sql`) — `AUD-16.sql` is a
    verify-and-reapply copy for prod since it wasn't in the original apply list.
17. **`ddc06d0` AUD-17: validate handleNotify input, always build links
    from getPlatformUrl** — `handleNotify` (any signed-in user notifying a
    colleague) had no validation on `title`/`message`/`url`/`type`: an open
    redirect / phishing vector via push+SMS+WhatsApp to another employee's
    phone. Added a `type` allow-list, 120/500-char caps, and a
    same-origin-relative-path check on `url`. New `notifyUser.ts
    resolveNotifyUrl()` is now the only way any notify path builds its deep
    link (`getPlatformUrl()` + relative path) — used by both `notifyOrgUser`
    and `insertTrustedCustomerReply`.
18. **`afece9e` AUD-18: delete getRequestBaseUrl** — built a quote/invoice
    link base from `x-forwarded-host`/`host`, both client-controllable behind
    a permissive proxy (forged-Host redirect risk on a customer's SMS'd
    link). Deleted; both links are now unconditionally `getPlatformUrl()`-based.
19. **`35d7afa` AUD-19: redact PII from logs** — new `api/_lib/redact.ts`
    `maskPhone()` (last 3 digits only), applied to inbound-sms.ts and
    smsOptOut.ts. inbound-email.ts's "Lead successfully created" log dropped
    the customer name / sender email in favour of just the lead id.
    Removed send-support-email.ts's `=== SUPPORT REQUEST ===` console dump
    entirely (reporter email + full free-text title/description on every
    request).

### Prod SQL files — **all three already applied to prod, 22-09-2026**

All in `docs/plans/prod-sql/`, each with a read-only verify query at the top.
Run via the Management API (`POST /v1/projects/abnheynzugpicikxwwmv/database/query`,
`SUPABASE_ACCESS_TOKEN` from `.env.local`) since the pooler cert is self-signed —
see [[prod-supabase-ops]]. The branch itself is still unpushed/undeployed, so
running these ahead of the deploy was safe: old prod code ignores the new
columns/switch entirely.

- **`AUD-9.sql`** — ✅ applied. Verified post-state: `orgs` (slug `default`)
  now has `website = 'https://tvmagic.com.au/'`, and
  `brand_feature_switches` has `campaign_quote.enabled = true` for the
  `tv-magic` brand (every other brand got the catalog row + a `false`
  switch row). This means **`campaign_quote` is live-armed for the tv-magic
  brand ahead of the code deploy** — once this branch ships, TV Magic's
  `/visualise/default` starts serving from the new per-org code path
  immediately, no separate switch-flip step needed at deploy time.
- **`AUD-10.sql`** — ✅ applied. `orgs.voicemail_imap_folder` column now
  exists, left NULL for org `default` (preserves today's env-var fallback
  behaviour exactly).
- **`AUD-16.sql`** — ✅ applied (re-run, idempotent). Verify-before showed
  `increment_rate_limit` / `increment_ai_usage` were **already** REVOKEd
  from anon/authenticated on prod — confirms
  `20260916130000_lock_counter_rpcs.sql` was already live pre-baseline, as
  suspected. Re-ran the REVOKE/GRANT anyway for certainty; no-op.
- *(AUD-11 through AUD-15, AUD-17, AUD-18, AUD-19 have no SQL — pure app code.)*

### New env vars (all optional, all fall back to today's literal)

| Var | Fallback if unset |
|---|---|
| `SUPPORT_INBOX_EMAIL` | `admin@fieldbournedigital.com.au` |
| `VITE_ONESIGNAL_APP_ID` | the hardcoded id in `src/lib/oneSignal.ts` |

(`orgs.voicemail_imap_folder` and `orgs.website` are DB columns, not env vars —
see the prod SQL section above.)

### Known gaps / follow-ups carried forward

- AUD-14's route/section boundaries were verified by typecheck + the
  existing suite only — **not** smoke-tested in a real browser this session
  (no dev server was started). Recommend manually loading `/leads`,
  `/calendar` and `/visualise/default` before shipping.
- AUD-15's phone-size leads-board fix (drag sensors, column scroll) also
  wants a manual phone-size QA pass — see the checklist below.
- AUD-9's campaign quote page is feature-switch-gated OFF by default for
  every brand except `tv-magic` (enabled on prod via `AUD-9.sql`, see
  above). A second test org won't see the visualiser/quote form at
  `/visualise/<that-org-slug>` until its own switch is turned on.
- All three prod SQL files are now applied — nothing left to run before or
  at deploy time for AUD-9/AUD-10/AUD-16. Deploy is otherwise still a plain
  code push (no other DB coordination needed for AUD-9 → AUD-19).

### Manual QA checklist (do before shipping this branch)

- [ ] Leads board on a real phone (or narrow + touch-emulated DevTools):
      drag a card between columns without it starting from a scroll swipe;
      confirm the column list scrolls independently and doesn't run under
      the home-indicator / browser chrome.
- [ ] A second test org through the Messenger/Facebook simulate flow with
      `orgs.service_types` left empty — confirm it falls back to the
      generic `FACEBOOK_SERVICE_TYPES` list instead of erroring or leaving
      the service type blank.
- [ ] The campaign quote page on a second slug (`/visualise/<slug>`) after
      turning its `campaign_quote` switch on — branding (name/logo/website/
      colour) should reflect that org, not TV Magic; then bare `/visualise`
      should still redirect to `/visualise/default` and work exactly as
      before for the live ad links.
- [ ] Booking-confirm (or another SMS/WhatsApp notify path) with a foreign
      (non-AU) number, to confirm nothing in the AUD-16/17 rate-limit /
      notify-validation changes rejects a legitimate international contact
      number.
- [ ] Trigger a render error in one route (e.g. temporarily throw in a
      component) and confirm the rest of the app — navigating to a
      different route — still works, matching AUD-14's intent.

## Agent 2: 🟢 Backlog (AUD-20 → AUD-24), 22-09-2026

Continuation on the same session/branch, same day. User approved continuing
past the checkpoint straight through the Backlog. Gated every commit the
same way (typecheck + full suite). Ended at **128 files / 959 tests**, all
green. **v1.1.200** released at the end (patch bump + changelog entry —
see below) with `npm run build` passing.

### Commits, in order

20. **`3bde473` AUD-20: requireRole + MANAGER_ROLES** — new
    `api/_lib/auth.ts` `requireRole(req, res, roles, forbiddenMessage?)`
    (token-verify + role lookup, no org/brand join — deliberately lighter
    than `authenticateRequest` so an org-less `platform_admin` isn't locked
    out, per `setProfileExclusions.ts`'s existing documented behaviour).
    Used in `platformSetTestProfile.ts`, `platformSetDeparted.ts`,
    `setProfileExclusions.ts`, `create-user.ts`'s invite handler. New
    `MANAGER_ROLES` const replaces each of `leads.ts`/`stripe.ts`/
    `send-sms.ts`'s own hardcoded `['manager', 'platform_admin']` array
    (those three keep calling `authenticateRequest` for full org context,
    just import the shared constant). No error-message or status-code
    changes — verified against each file's prior manual checks.
21. **`2e18aa2` AUD-21: structured logger + eslint no-console** — new
    `api/_lib/log.ts` (`log.info/warn/error`, one JSON line per call).
    Converted all 29 `console.log` call sites across 13 files in `api/` —
    several had been double-stringifying
    (`console.log(tag, JSON.stringify(result))`), now fixed as a side
    effect. `console.error`/`console.warn` untouched (out of this card's
    scope). New `eslint.config.js` `no-console` rule scoped to `api/**`,
    warn severity, `allow: ['info', 'warn', 'error']` — lint isn't in the
    prebuild gate, so this won't block a deploy, just flags a future bare
    `console.log` in review. Also fixed an unrelated dead `maskPhone`
    import in `inbound-email.ts` left over from AUD-19, caught by the new
    rule's file-level pass.
22. **`35a37b5` AUD-22: shared useNow() ticker** — new
    `src/hooks/useNow.ts` (`useSyncExternalStore`-backed, one shared
    `setInterval(1000ms)` created lazily on first subscriber, torn down
    when the last unmounts). Replaces per-card `setInterval` in
    `UnassignedTimer`, `ContactFollowUpBadge`, `CountdownTimer` — a leads
    board with 50 cards used to run up to 50 independent 1s intervals.
    `ContactFollowUpBadge` still calls `getContactFollowUpState()`
    (reads `Date.now()` internally) rather than being refactored to take a
    `now` param — that function is shared with non-UI code and changing
    its signature was out of scope here; the shared tick is just what
    triggers its re-render.
23. **`2d1b41d` AUD-23: shared/datetime.ts + DatePill, ROLES/LEAD_STATUSES
    from shared** — new `shared/datetime.ts` `formatOrgDate(d, tz, style)`
    with 9 named `Intl.DateTimeFormatOptions` presets, replacing 9 ad-hoc
    `toLocaleDateString({...})` calls across `Calendar.tsx`,
    `EventModal.tsx`, `MobileResourceView.tsx`, `resolveInvoiceAmount.ts`,
    `EmployeeDashboard.tsx`, `ManagerDashboard.tsx`. Optional `tz` renders
    in an org's own timezone instead of the viewer's device timezone
    (nothing currently passes one — all call sites pass `null`, so
    behaviour is unchanged; wiring an actual org timezone through is a
    follow-up, not done here). New `DatePill` component used at the one
    site that rendered a date straight into JSX rather than building a
    string. New `shared/roles.ts` (`ROLES`, `Role`) and
    `shared/leadStatuses.ts` (`LEAD_STATUSES`, `LeadStatus`) —
    `src/lib/roles.ts` now derives `AppRole` from the shared `ROLES`
    instead of hardcoding its own union; `src/lib/leadsKanban.ts`'s
    `LEAD_STATUS_LABELS` is checked against `LeadStatus` via `satisfies`
    for exhaustiveness at the definition site, but stays typed
    `Record<string, string>` on export since callers index it by a DB
    row's unconstrained `status` column.
24. **`cdc8218` AUD-24: untrack dev-dist, npx knip report** — `git rm -r
    --cached dev-dist` (vite-plugin-pwa dev-mode SW output, build-
    generated) + added to `.gitignore`. `npx knip` run report-only,
    nothing deleted, full output saved to
    `docs/plans/knip-report-2026-09-22.txt` with a note that most
    "unused files" are false positives (Vercel functions, Supabase edge
    functions, PWA SW scripts, npm-run scripts — none of which knip
    recognises as entry points). A few things worth a follow-up look:
    2 unused devDependencies (`@types/google.maps`, `sharp`), 4
    duplicate-export pairs in `shared/contactFollowUp.ts`, and a short
    list of exported constants/functions in `src/lib/*` that look
    genuinely dead.
25. **`8dcc862` Release v1.1.200** — patch bump (`package.json` +
    `APP_VERSION`) and a `WEEKLY_CHANGELOG` entry summarising this
    session's user-visible changes (per-org campaign branding, the
    leads-board phone drag/scroll fix, route-level crash containment, the
    triple-polling fix, and the AUD-13 silent-failure fixes). `npm run
    build` (verify-changelog + typecheck + vite build) passes.

No prod SQL for AUD-20 → AUD-24 — all pure app code / tooling.

### Preview deployment (this session, prod-Supabase-pointed)

At the user's explicit request (their dev Supabase project was found
paused/`INACTIVE` — resumed it via the Management API restore endpoint
as a side effect, but it ended up unused), this session's Preview-scoped
Vercel env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
were **removed and re-added copying Production's values** (`vercel env rm`
then `vercel env add`, piping straight from a `vercel env pull
--environment=production` file so the actual secret values never passed
through the assistant's own context — the sandbox's credential-handling
guard blocks that). **This means every Preview deployment on this Vercel
project now points at prod Supabase, not the (now-resumed) dev project,
until someone reverts it** — check `vercel env ls preview` before assuming
a future preview build is data-isolated.

A preview build was then deployed (`vercel deploy --yes`, no `--prod`) at
commit `1f8abf0` (after AUD-19, before AUD-20): **https://tv-magic-companion-qktwj59ac-missbeardys-projects.vercel.app**.
It is stale relative to the final `8dcc862` state (AUD-20 → AUD-24 and the
v1.1.200 release shipped after it) — redeploy from the branch tip before
relying on it for testing AUD-20+ specifically. Two pre-existing TS errors
appeared in the remote build log (`api/send-sms.ts` account-deletion
handler, `api/_lib/reviewRequest.ts` auto-review guard) — checked both,
correct discriminated-union code untouched this session; matches this
project's documented history of the Vercel per-function builder flagging
things the project-wide `npm run typecheck` doesn't (see
[[preview-deploy]]). Deploy still completed (`readyState: READY`).

### Updated manual QA checklist additions (Backlog cards)

- [ ] Confirm `platformSetTestProfile`/`platformSetDeparted`/
      `setProfileExclusions` still work for an org-less `platform_admin`
      account if one exists — AUD-20's `requireRole` was deliberately kept
      lighter than `authenticateRequest` specifically to preserve this.
- [ ] Leads board with several cards open at once on a phone — confirm the
      countdown/unassigned/follow-up timers all still tick every second
      (AUD-22's shared ticker) and don't drift or stall.
- [ ] Since Preview now points at prod Supabase (see above), be deliberate
      about what gets tested there — creating a lead, submitting the
      campaign quote form, or anything that sends SMS/WhatsApp will be a
      **real** side effect against the live TV Magic org, not a sandboxed
      one.
