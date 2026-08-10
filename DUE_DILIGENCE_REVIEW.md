# FieldBourne — Technical & Product Due Diligence Review

| Field | Value |
|-------|-------|
| **Purpose** | Independent end-to-end due diligence: is this valuable, focused, scalable, mobile-ready, and worth more investment? **Adopted 06-08-2026 as the governing roadmap** — supersedes tier ordering in [ROADMAP.md](ROADMAP.md) until re-reviewed. |
| **Status** | Governing document. Owner-adopted 06-08-2026. |
| **Reviewed** | 06-08-2026 · v1.1.154 |
| **Method** | Full read of ROADMAP.md, docs/PROJECT.md, docs/BUSINESS.md, docs/MARKETING.md; code audit of `api/`, `shared/`, `src/`; schema audit of `supabase/migrations/`; **executed** `vitest run` (534 pass) and `vite build` (measured bundle). Every claim below traces to a file, a line, or a command output. |
| **Board** | All 20 findings are carded in `.devtool/features/` as **Backlog** (`dd1`–`dd20`, orders `Z0`–`ZJ`, so they sort above the pre-existing cards). Seven pre-existing cards were triaged into **Review** for owner decision — each carries a "Board review 06-08-2026" assessment in its body. This doc is the spec; the board is the queue. |
| **Related** | [ROADMAP.md](ROADMAP.md) · [docs/PROJECT.md](docs/PROJECT.md) · [docs/BUSINESS.md](docs/BUSINESS.md) · [docs/MARKETING.md](docs/MARKETING.md) |

---

## Rules for now (read before starting any session)

These replace "work top-down through Tier 1" until the Phase 8 Critical list is clear.

1. **Nothing ships until it is observable.** No new feature work while `dd1` (Sentry + analytics) is open. You cannot improve, sell, or debug what you cannot see.
2. **Work the Critical list (`dd1`–`dd6`) top-down.** These are launch blockers, not preferences. Only `dd13` (market contact) may run in parallel — it is not engineering work.
3. **Tier 3 is frozen.** No T3.x item may be promoted or built until five paying strangers exist (`dd13`). T3.1 Xero was built in violation of the T2.9 gate on 23-07-2026 — that must not repeat.
4. **Subtraction beats addition.** Before adding a feature, check `dd18`/`dd19`/`dd20` — deleting is the higher-value move at this stage.
5. **Every claim in a doc must trace to shipped, switch-ON, verified behaviour.** Carry over from MARKETING.md claims discipline; extended here to roadmap status (see §Verification debt).
6. **Existing conventions still apply:** per-brand switch question on every feature; switches gate server endpoints not just UI; bump `src/lib/changelog.ts` + `package.json` together; pure logic to `src/lib`/`shared` with vitest tests; pipeline changes version-bump `docs/SALES_PIPELINE_WORKFLOW.md`.

---

## Executive summary

Better-engineered than the median seed-stage product; further from sellable than the internal documents imply.

The gap is not features — there are too many. The gap is that **nothing here has ever been tested against a stranger**, and the artefacts produced to compensate (a 227-line governing roadmap, three strategy docs, a 32-switch tier-gated flag system, a 12-item Tier 3) are sophisticated planning standing in for market contact.

The most damning number in the repository: **1 customer, 20+ roadmap items shipped in three weeks, 0 requested by a stranger who has ever paid.**

**Overall: 5.5/10.** A well-engineered, over-scoped, entirely unvalidated product built by someone clearly capable. The engineering is, in several places, better than the business stage deserves. That is precisely the diagnosis.

**Baseline metrics (06-08-2026):** 44,670 LOC (src + api + shared) · 29 tables · 72 migrations · 82 test files / 534 tests passing / 13.4s · 21 routes · 32 feature switches · 65 components · **1,555 kB JS bundle (439 kB gzip), one chunk** · 0 error-monitoring tools · 0 analytics tools.

---

## Phase 1 — The business

### What it is

Multi-tenant field-service CRM for Australian trades. Ingests enquiries from SMS / email / voicemail / missed call / Facebook Messenger / Facebook Lead Ads, AI-parses them into structured leads, then **enforces working each lead** through a 10-stage pipeline: timers, contact rounds, quote e-sign, booking, ATO-compliant invoicing, Stripe Connect payment, chase ladders, review request.

### The thesis is correct

MARKETING.md's wedge — *"ServiceM8 and Tradify manage jobs you already won; we win the jobs you're missing"* — is the strongest sentence in this repository:

- **Differentiated by construction.** Both incumbents assume the job already exists. The capture→extraction→enforcement layer has no direct equivalent at this price point.
- **Migration-objection-proof.** Leads are new data, so there is nothing to migrate. This kills the #1 SMB SaaS switching objection.
- **Priced against recovered revenue, not a competitor.** "$300–$1,500 per recovered job" vs "$69/mo" is a 4–20× frame. Correct — you cannot win a price war against a $0 free tier.

Better-reasoned positioning than most funded startups have.

### Where the case is hollow

**1. Customer count is one, and payment is unverified.** BUSINESS.md says "one paying client"; nothing in the repo evidences a Stripe subscription against that org. If the relationship is a design-partner arrangement, validated demand is zero and every number in BUSINESS.md is a hypothesis wearing a suit. → **`dd13`**

**2. The value proposition is obvious to the builder and invisible to a buyer.** No landing page, no pricing page, no recorded demo (T2.2 shipped a *runbook*, not an asset), no case study. Lead with the loss, not the software category:

> **"You missed 3 calls this week. Two of them booked with someone else."**

→ **`dd12`**

**3. "Front-door add-on" is strategically right and operationally under-costed.** It elegantly dodges Xero/migration/parity objections, but the tradie now runs two apps, enters the customer twice, and reconciles two sources of truth. There is currently **no answer** to *"how does the booked job get into ServiceM8?"* That objection kills the add-on pitch in month two — which is worse than month one, because it arrives as churn instead of a lost sale. Needs an honest answer before soft launch, even if the answer is "you copy it across, and here's why that's still worth $69."

**4. The pain is real but intermittent, and intermittent pain churns.** A missed call costing $600 is agonising — the week it happens. In a quiet month the tradie sees $69 against zero visible recoveries and cancels. BUSINESS.md already identifies the fix ("we saved you $X this month") and files it as a future retention hook. **It is not a nice-to-have; it is the only structural defence against silent churn.** → **`dd11`**

---

## Phase 2 — Technical architecture

### Genuinely good — unusually so for a solo build

- **Multi-tenancy is real, not aspirational.** `brands → orgs → profiles` with org-scoped RLS: 82 `CREATE POLICY` statements; only 3 legacy `USING (true)` policies, one of which `20260710140000_indexes_retention_rls.sql` went back and tightened. Most solo SaaS has tenant isolation in the WHERE clause and prays.
- **Server-side auth is correct.** `api/_lib/auth.ts` verifies the JWT via `supabase.auth.getUser(accessToken)` against the service-role client and resolves org/role **server-side** rather than trusting client claims. Role checks enforced per-action (`api/send-sms.ts:301,530,614`).
- **Webhook signature verification everywhere it matters** — Twilio, Stripe, CloudMailin, Meta, plus a `timingSafeCompare` helper.
- **Security headers above average** — HSTS, `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, scoped `Permissions-Policy` (`vercel.json:12-45`).
- **46 indexes, and the right composite ones** — `leads_org_status_hidden_idx`, `quotes_token_expires_idx`, `lead_events_org_created_at_idx` — not a naive column-per-index sweep.
- **534 tests pass in 13s**; the pure-logic-in-`src/lib`/`shared` convention is actually followed across 60+ modules.
- **The offline architecture is the best code in the repo** — IndexedDB queue, FIFO replay, per-item try/catch, and a **status re-read conflict guard** on completions. That guard shows someone reasoned about double-completion under replay. Rare.

### 🔴 Critical

#### C1 — Zero observability. No error monitoring. No analytics. → `dd1`

**Evidence:** no Sentry, PostHog, Vercel Analytics or equivalent anywhere in `src/`, `api/`, or `package.json`. 47 `console.error` calls into a Vercel log nobody reads. One `ErrorBoundary` (`src/main.tsx:9`) that catches, renders a fallback, and tells no one.

**Impact.** The worst problem in the codebase, and invisible because everything compiles. The **entirety of Tier 1** was a response to one bug class — silent write failures on the money path. Those were found by manual code review, months after shipping, after the client said *"the app lost my job."* There is no mechanism to find the next one faster. At 20 orgs you will be debugging by SMS.

Second-order: BUSINESS.md lists the metrics that matter — speed-to-lead, recovery rate, activation, feature adoption, *"churn early-warning: falling lead volume."* **Not one is measurable today.** The data is in `lead_events`; there is no instrumentation, funnel, cohort or dashboard. You are planning a launch you would be unable to read.

**Fix.** Sentry (client + serverless, free tier) and PostHog or Vercel Analytics with ~12 named events: `lead_captured`, `ack_sent`, `quote_sent`, `quote_accepted`, `job_completed`, `invoice_paid`, `offline_queue_flush_failed`. **Difficulty: Easy. Nothing else in this document matters as much.**

#### C2 — Rate limiting does not work → `dd4`

**Evidence:** `api/anthropic.ts:6-17`, `api/send-sms.ts:35`, `api/geocode.ts:7`, `api/social-post.ts:6` each declare `const rateLimitMap = new Map()` at module scope.

**Impact.** Serverless: every concurrent Lambda instance gets its own Map; every cold start wipes it. Effective limit is `10 × (instances Vercel happens to spin up)` — unbounded under exactly the burst traffic a limiter exists to stop. Protection theatre. Four copies of the same broken function, plus a fifth in `api/_rateLimit.js` — **a `.js` file containing TypeScript generics** (`Map<string, {...}>`), a runtime syntax error if anything imported it. Nothing does.

**Fix.** Postgres-backed counter (honest at this scale — the DB is already there) or Upstash Redis. Delete `_rateLimit.js`. **Difficulty: Easy–Medium.**

#### C3 — `/api/anthropic` is an authenticated open LLM proxy → `dd5`

**Evidence:** `api/anthropic.ts:48-72` accepts an arbitrary `messages` array from the client and forwards it verbatim to Claude on the platform API key, clamped only to 2000 tokens and the broken limiter above.

**Impact.** Any authenticated user on any Pro org — a customer, an ex-employee with a live session, anyone who lifts a token — has a free general-purpose LLM billed to you. Not a data breach; a cost, abuse, and content-liability vector.

**Fix.** Server-side prompt construction: client sends `{ leadId, rawText }`, server builds the prompt. This is already done correctly in `api/_lib/extractLead.ts` — the generic proxy is a legacy path that should not exist. **Difficulty: Medium** (migrate callers).

#### C4 — Vercel Hobby is corrupting the architecture and the legal position → `dd2`

**Evidence:** `api/send-sms.ts` is 39 KB and dispatches 4 public quote/invoice endpoints, a cron sweep chain, 2 push endpoints, and 6 authenticated actions (`api/send-sms.ts:747-816`). Comments throughout read *"consolidated to stay under the Vercel Hobby 12-function limit."* PROJECT.md hard-codes: **"Never add a new file under `api/` root."**

**Impact — three compounding harms:**

1. **Design.** A god-hub with mixed trust boundaries in one file. Public unauthenticated handlers sit above the auth gate; every addition makes *"is this action authed?"* harder to answer by reading. This is the shape that eventually produces an auth bypass.
2. **Blast radius.** One bad deploy or one module-scope throw takes down quotes, invoices, push, cron and notifications simultaneously. PROJECT.md documents this exact failure mode — an extensionless import "500s the entire function hub at runtime."
3. **Legal.** Vercel Hobby prohibits commercial use. If the client pays, **you are in breach today**, and Vercel can pull your only customer's production system with no notice.

**Fix.** Pay the ~US$20/mo. Removes the cap, removes the breach, unblocks decomposing the hub. **Difficulty: Easy — a credit-card decision deferred into an architectural constraint.**

#### C5 — Production is not migration-driven → existing card `t27-live-prod-schema-reconcile-operator`

**Evidence:** T2.7 PARTIAL; live `db push` deferred pending a PITR window. PROJECT.md: *"Prod was stood up by cutover script, not migrations — `supabase/migrations/` is not a faithful description of prod."* Mixed 2025/2026 timestamp prefixes out of authoring order. T1.11's log notes a migration *"already applied out-of-band, not tracked in `supabase_migrations`."*

**Impact.** Production cannot be reproduced or safely bulk-migrated. Every ad-hoc Management API change widens the drift. Blast radius today is one customer; at ten it is the business, and the first bad schema op is unrecoverable without PITR.

**Fix.** Supabase Pro + PITR **on**, then execute `supabase/RECONCILIATION.md`, before customer #2. **Difficulty: Hard, and rising.** (PITR/Pro portion folded into `dd2`.)

### 🟠 Important

| # | Finding | Evidence | Fix | Card |
|---|---|---|---|---|
| **I1** | **1,555 kB bundle, zero code splitting.** `dist/assets/index-*.js 1,555.33 kB │ gzip: 438.67 kB`; precache 1,667 KiB. 21 routes in `src/App.tsx`, **zero `React.lazy`, zero `Suspense`, zero dynamic imports.** Recharts, @xyflow, @dnd-kit, canvas-confetti ship to every user. Directly contradicts marketing pillar 3 (*"works on a $300 Android"*) — ~4–8s of parse+execute on budget Android/3G, at the highest-value moment (tech opening the app for an address on site). `@xyflow` exists for a Platform Admin screen only the founder opens. | measured `vite build` | `React.lazy` on ReportsPage, PlatformAdminPage, SocialPage, CalendarPage. Roughly halves the field-tech path. **Easy — largest single UX win available.** | `dd7` |
| **I2** | **Three sequential DB round trips per authenticated API call.** `api/_lib/auth.ts:57-84`: `getUser()` → `profiles` → `orgs` → (`brands`). Four hops before the handler starts, uncached, every request. | code | Single RPC or joined view; optional short-TTL token cache. **Easy.** | `dd8` |
| **I3** | **CSP is decorative.** `vercel.json:37` ships a well-constructed policy as `Content-Security-Policy-Report-Only` with **no `report-uri` or `report-to`**. Blocks nothing, reports nowhere. Exists to pass a scanner. | `vercel.json` | Add a reporting endpoint, watch a week, promote to enforcing — or delete it. **Easy.** | `dd9` |
| **I4** | **`LeadsPage.tsx` is 1,412 lines, 22 `useState`, 11 `useEffect`.** The most-modified file, on the money path, with no test coverage of its own (pure logic was correctly extracted to `src/lib`; orchestration was not). Every Tier 1 item touched it. | code | Extract `useLeadsData`, `useLeadActions`, `useCompletionFlow`. **Medium.** Not urgent — but it is where the next silent bug will live. | `dd14` |
| **I5** | **No data layer.** No React Query/SWR; 33 raw `supabase.from()` calls in components. No request dedup, no cache, no background refetch; hand-rolled loading/error per call site. This is *why* every Tier 1 reliability fix had to be applied site-by-site instead of once in a layer. | code | Accept the debt; stop adding raw calls in new components; migrate opportunistically. **Hard to retrofit.** | `dd16` |
| **I6** | **Two competing manifests shipped.** `index.html` links `/manifest.json` (static); vite-plugin-pwa generates `/manifest.webmanifest` from a **duplicate config block** in `vite.config.ts` that nothing references. Both land in `dist/`. Guaranteed to drift. | `dist/` listing | Delete one. **Easy.** | `dd6` |

---

## Phase 3 — UX

Caveat stated plainly: pixels were not reviewed, and **there is no telemetry**, so neither reviewer nor owner knows where users actually struggle. Below is code inference plus the owner's own audits.

### Genuinely strong

The Tier 1 work is real UX engineering, not polish:

- **Removing the `window.confirm` from the call path (T1.5).** Calling is the highest-frequency action; a modal explaining CRM status semantics before dialling is a category error, and it was deleted.
- **Optimistic status bump with an Undo toast** instead of a confirm dialog — the correct modern pattern (Nielsen #3 *user control and freedom*, without paying Nielsen #5's error-prevention tax on every call).
- **Draft persistence across the completion ceremony** — because a phone call kills a PWA mid-flow. Real-world observation, not a checklist item.
- **Cached read-through so the address is visible in a black spot.** The difference between a product and a demo.
- **≥44px targets on the money path**, with destructive statuses confirmed *only* in the dropdown — targeted friction exactly where a mis-tap costs money.

Someone watched a tradie use this. The instinct on display is good.

### Where it will still lose people

- **Cognitive load: 32 switches × 2 operation modes.** `solo` vs `team` changes core mechanics (pool timers, contact rounds, auto-assign). With per-brand switches mostly defaulting OFF, the product has thousands of possible configurations and **approximately one has been tested.** T2.6 exists because *"new orgs feel empty with switches default off"* — that is the symptom; the disease is that configurability was built before the default was validated. → `dd19`
- **Onboarding is a runbook, not a product.** `ONBOARDING_RUNBOOK.md` is founder-led. Correct for customers 1–10; a hard ceiling at 20. It also means every *"does this work for a stranger?"* question is currently answered by the founder being in the room.
- **Platform Admin is a second product.** Orgs, brands, switches, template editors, workflow-run graph observability, inbound simulator, lead trace, test profiles — 618 lines plus a `src/components/platform/` tree. Every hour there was an hour not spent on the tradie's screen. It serves exactly one user.
- **First impressions are unmeasured and undesigned.** No marketing site, no in-app orientation for a self-serve visitor. A stranger's first 60 seconds is the least-designed part of the product. → `dd12`
- **Accessibility is weak.** 33 `aria-label`s across 235 `<button>`s; 8 `role` attributes; 18 `alt`s; no focus-trap audit on bottom sheets/modals; no automated a11y test. For a one-handed field app in bright sun, contrast and target size matter more than screen readers — but Play listings do attract accessibility scrutiny, and a Lighthouse a11y pass would fail badly. → `dd15`

---

## Phase 4 — Product: the feature creep, named

| Feature | Evidence | Verdict |
|---|---|---|
| **Social posting (Zernio)** | `SocialPage.tsx` 512 lines, `LeadSocialModal`, `api/social-post.ts`, `generateCaption.ts`. T3.6: *"fully built but parked and its server gate never UAT'd"* | **DELETE.** Nothing to do with never losing a lead. Frees a function slot and ~700 lines. |
| **Tasks / task boards** | `tasks` + `task_items` tables, orphaned `TaskBoardPage.tsx`, BillingPanel advertising a dead `/tasks` route | **DELETE.** Shipped, orphaned, still advertised in the billing UI. |
| **Xero live sync** | `api/xero.ts` 16 KB, OAuth flow, T3.1 shipped v1.1.144 — **pulled forward from Tier 3, never UAT'd against a real Xero account** | **Governance failure.** T2.9 explicitly decided Xero stays Tier 3 under the front-door position. Three days later it shipped. Nobody asked for it. |
| **Workflow-run graph observability** | `@xyflow/react`, `workflow_runs` + `workflow_run_steps`, Platform Admin graph UI | **Downgrade.** Enterprise-grade internal tooling for a one-customer product, shipped in every user's bundle. |
| **Dual push transports** | OneSignal *and* self-hosted VAPID via `native_web_push`, per-recipient fallback (`api/_lib/pushTransport.ts`) | **Justified — but finish it.** The migration design is genuinely careful. Don't let T1.13 teardown slip; two push stacks is a permanent tax. → `dd10` |
| **32 feature switches with tier gating** | `shared/featureSwitchCatalog.ts` | **The deepest creep, disguised as architecture.** Franchise-grade config built before a stranger validated the defaults. Each switch is a branch to test and a support question. → `dd19` |
| **Brands layer** | `brands → orgs`, per-brand templates/colors/switches | **Keep, keep parked.** Genuinely valuable and rare — but it is a *second business model* (B2B2B white-label) built alongside the first. BUSINESS.md correctly parks it. |
| **T3.2–T3.12** (certs, recurring, timesheets, POs, MYOB, tracking, surcharge, self-serve…) | ten backlog items | **Prune to two.** Keep T3.2 (certificates — a market-*eligibility* gate for licensed trades) and T3.3 (recurring jobs — cheap, frequently asked). Delete the rest. A roadmap you cannot execute is a monthly guilt tax. → `dd20` |

### The MVP to cut to

The 60-second demo **is** the MVP, and it is already written:

> missed call / SMS in → branded auto-ack → AI-parsed lead card with countdown → tap-chip quote → e-sign accept → booked with confirmation SMS → one-tap invoice → Pay Now → auto review request

That is the product. Everything else — social, tasks, Xero, workflow graphs, tech GPS, internal messaging, reports, monthly snapshots, brands, 32 switches — is scaffolding around a nine-step spine that, to the builder's credit, **is fully built and works.**

The most valuable action available this month is not building. It is **subtracting until the app is only the spine**, shipping that to five strangers, and letting them say what to add back.

---

## Phase 5 — Android readiness

**Should it be mobile? Yes, emphatically.** The tradie's loop — get pinged, tap call, quote from a chip, book, arrive, photograph, complete, invoice — is entirely phone work in a van or on a roof. The desktop surfaces (dnd-kit kanban, reports, Platform Admin) belong to managers, and there are far fewer managers.

### Build it as a TWA. Do not rewrite. → `dd17`

Reasoning, stated explicitly because this is the highest-stakes technical decision on the table:

- **The value is server-side.** SMS ingestion, AI extraction, webhooks, cron sweeps, Stripe, chase ladders — all in `api/` and Postgres. The client is a CRUD-and-notification shell. A native rewrite reimplements the *cheap* half of the product.
- **A rewrite costs 3–6 months, and speed is the only advantage available.** One developer, one customer, no validated demand. Porting 44,670 lines to Flutter to obtain a listing achievable in a week would be the worst decision on the menu.
- **It would fragment the codebase** — two clients to maintain, or abandon the web app the manager surfaces need.
- **A TWA is a real Android app** — Play listing, Play install, no browser chrome, home-screen icon, real push via FCM. The T1.12 self-hosted Web Push work makes this *better*, not worse: VAPID delivers straight to FCM with no OneSignal hop.

**Ruled out:** Flutter (rewrite), React Native (rewrite; its web story wouldn't save the manager screens), Kotlin (rewrite + Android-only + still need the web app). **PWA-only** is the right *engine* but insufficient as distribution — see below.

**iOS: later, or not initially.** Competitive intel says ServiceM8 is iOS-first with a famously weak Android app. Android-first is genuine differentiation *and* the larger AU tradie segment. Don't split focus.

### Then why Play at all?

Not technical. MARKETING.md's own finding: *"tradies buy on mate's recommendation and app-store ratings."* No store presence → no ratings → no social proof → the *"where's the app?"* objection currently answered with a defensive paragraph about install-from-link. **Play is a distribution and credibility decision.** TWA gets there in days. That is the entire argument.

### Blocker: the icons are broken → `dd6`

Verified by reading the bytes:

```
public/fieldbourne-logo.png  sig ffd8ffe0 (JPEG/JFIF)  24,949 bytes  md5 25e189f5…
public/tvmagic-logo.png      sig ffd8ffe0 (JPEG/JFIF)  24,949 bytes  md5 25e189f5…
```

Three problems in one file:

1. **It is a JPEG named `.png`**, declared `"type": "image/png"` in the manifest.
2. **It is byte-identical to the TV Magic logo.** The T2.3 "rebrand" copied the file. The FieldBourne PWA icon is the client's logo.
3. **It is declared at both 192×192 and 512×512** from one 24 KB file, one entry `purpose: "maskable"` — Android will apply the maskable safe-zone crop to a logo never designed for it and chop it.

Bubblewrap requires a genuine ≥512×512 PNG. This blocks packaging outright and would fail a Lighthouse PWA audit today. **Easy to fix in code; requires an actual designed icon, which cannot be coded around.**

---

## Phase 6 — Google Play review (as a reviewer)

**Verdict if submitted today: rejected, not close.**

| # | Blocker | Policy | Fix | Card |
|---|---|---|---|---|
| 1 | **No privacy policy.** None in `src/`, no route, no URL. | Required for every app with a Data Safety declaration — i.e. all apps. | Write and host. Must cover Supabase/Vercel/Twilio/Anthropic/Stripe/Resend as US-hosted subprocessors + Australian Privacy Principles. | `dd3` |
| 2 | **No in-app account deletion.** No `deleteAccount` anywhere. | Play's account-deletion requirement: apps allowing account creation must offer in-app deletion **and** a web-accessible deletion URL. | Build both. Non-trivial against the audit/soft-delete model — decide what is deleted vs anonymised vs retained for ATO invoice obligations. **Medium.** | `dd3` |
| 3 | **No Terms of Service.** | Not a blocker alone; required for the subscription flow and any Data Safety claim. | Write. | `dd3` |
| 4 | **Data Safety form unanswerable.** Collected: customer names, phones, addresses, **GPS location** (`tech_location`), **photos**, payment metadata. | Must be accurate and match reality. | Audit exactly what is collected/shared/retained before filling it in. A wrong answer here is an enforcement action, not a rejection. | `dd3` |
| 5 | **Broken icons** (Phase 5). | Packaging blocker. | Real 512×512 PNG + separate maskable. | `dd6` |
| 6 | **Permissions** — camera, location, notifications. | Each justified in-listing; location scrutinised hard. | `tech_location` (GPS tracking of employees) is the riskiest declaration. Ensure foreground-only, consented, clearly explained — otherwise it triggers a Sensitive Permissions review. | `dd17` |

**Two flagged with honest uncertainty:**

- **Billing.** If the app contains any subscription purchase or upgrade flow, Google Play Billing rules engage. The well-trodden safe path — what ServiceM8, Tradify and Xero all do — is **ship a login-only app with no purchase UI and no link to purchase**, billing on the website. Do exactly that: exclude `BillingPanel.tsx` from the Android build. The precise wording of Play's B2B carve-out is not something to rely on. → `dd17`
- **Minimum Functionality / webview-wrapper spam policy.** Thin-site TWAs get rejected. A TWA of a genuine authenticated SaaS with push and offline support is standard and passes — but the listing screenshots must show the app doing real work, not a login screen.

---

## Phase 7 — Market validation

**Demand: real, but unproven by this product.** Missed-call-text-back is a validated category with several funded players. The AU trade-software market is real and ServiceM8/Tradify have proven willingness to pay $29–$62/user. What is unproven is that a solo AU tradie pays **$69/mo for a second app** alongside the one they already have. That is the actual bet, and n=1 tells you nothing about it.

**Retention: the biggest risk, and it is structural.** SaaS retention needs a daily habit. This product's habit is *reactive* — it matters when a lead arrives. Quiet week → no visible value → churn. ServiceM8 retains better structurally because the tradie *must* open it to see today's jobs. FieldBourne partly has this (calendar, completions), but the front-door add-on position **deliberately hands the daily habit to the incumbent** and keeps the intermittent one. That is the hidden cost of the add-on strategy and it is not in BUSINESS.md. Mitigation is `dd11` — the monthly recovery digest converts intermittent value into a monthly proof-of-worth ritual.

**Competitors: the read is accurate.** ServiceM8's weak Android app is a genuine, verifiable wedge; neither incumbent does capture+enforcement. Be honest about their advantages: brand, review base, accountant relationships, certificates and recurring jobs (which exclude you from licensed trades entirely — T3.2 is an eligibility requirement, not a nice-to-have), and the ability to ship missed-call-text-back in a quarter once you prove the market for them. The moat is the *worked pipeline*, not any single feature.

| Dimension | Score | Reasoning |
|---|---|---|
| **Product-Market Fit** | **3/10** | One user, payment unverified, who is also the design partner. Thesis strong; evidence absent. PMF is measured, not argued — and there is no measurement. |
| **Retention Potential** | **4/10** | Intermittent value + add-on positioning + zero analytics to detect churn early. Raisable to ~7 with `dd11` and a daily-habit surface. |
| **Business Value** | **6/10** | Real problem, real category willingness-to-pay, margin-positive unit economics at $69 (the COGS maths checks out). Discounted for unvalidated price. |
| **Differentiation** | **7/10** | Genuinely differentiated capture+enforcement; AU-correct GST/ABN; all-messaging-included is a real weapon vs Tradify's 20¢. Capped because an incumbent could replicate in a quarter. |

---

## Phase 8 — Brutal prioritisation

### 🔴 Critical — before any stranger touches this

| # | Item | Card |
|---|---|---|
| 1 | **Sentry + product analytics.** Flying blind, about to add passengers. | `dd1` |
| 2 | **Vercel Pro + Supabase Pro + PITR.** Ends the commercial-use breach, ends the 12-function cap, makes prod recoverable. ~US$45/mo. | `dd2` |
| 3 | **Execute prod schema reconciliation** — after PITR is on, before customer #2. | `t27` (existing) |
| 4 | **Privacy policy, terms, in-app account deletion.** Real PII exposure + three of Play's six blockers. | `dd3` |
| 5 | **Fix the rate limiter; delete `api/_rateLimit.js`.** | `dd4` |
| 6 | **Close the open LLM proxy.** | `dd5` |
| 7 | **Real 512×512 PNG icon that is not the client's logo**; drop the duplicate manifest. | `dd6` |
| 8 | **Talk to ten tradies who are not the current client.** Not a build task. The highest-value item here and the only one not doable at a keyboard. | `dd13` |

### 🟠 Important — next 60 days

| # | Item | Card |
|---|---|---|
| 9 | Code-split the routes. Halves first load for field techs. Two hours. | `dd7` |
| 10 | **Record the 60-second demo.** A runbook exists for the highest-leverage sales asset in the business, and no video. | `dd12` |
| 11 | **Get the client case study** with real `lead_events` numbers. BUSINESS.md calls it *"the single highest-value asset available right now"*; unticked since 20-07. | `dd12` |
| 12 | **Landing page with pricing.** There is no front door. | `dd12` |
| 13 | Collapse `auth.ts` to one query. | `dd8` |
| 14 | Finish T1.13 OneSignal teardown. Don't carry two push stacks. | `dd10` |
| 15 | **Monthly "we recovered $X" digest** — the best retention mechanism, unbuilt. | `dd11` |
| 16 | Enforce the CSP or drop it. | `dd9` |

### 🟢 Nice to have

| # | Item | Card |
|---|---|---|
| 17 | Decompose `LeadsPage.tsx`. | `dd14` |
| 18 | Accessibility pass — labels, focus traps, contrast. | `dd15` |
| 19 | React Query data layer. | `dd16` |
| 20 | TWA packaging + Play submission — **after** items 1–8, not before. | `dd17` |
| 21 | Multi-region / caching. Not a real problem until ~100 orgs. | — |

### ❌ Remove

| # | Item | Card |
|---|---|---|
| 22 | **Social posting** — `SocialPage`, `LeadSocialModal`, `api/social-post.ts`, `generateCaption.ts`, Zernio. Frees a function slot. | `t36` (existing — decide DELETE) |
| 23 | **Tasks** — `tasks`/`task_items` tables, `TaskBoardPage.tsx`, the dead `/tasks` link in BillingPanel. | `dd18` |
| 24 | **`api/_rateLimit.js`** — dead and syntactically invalid. | `dd18` |
| 25 | **`public/tvmagic-logo.png`** and one of the two manifests. | `dd18` |
| 26 | **Ten of twelve Tier 3 items.** Keep T3.2 and T3.3; delete the rest from the document. | `dd20` |
| 27 | **Cut 32 switches toward ~12.** Everything the wedge needs, ON by default. Every switch deleted is a configuration no longer tested or explained. | `dd19` |

---

## Phase 9 — Launch readiness scores

| Dimension | Score | Reasoning |
|---|---|---|
| **Architecture** | **6/10** | Clean seams (`shared/`, `_lib/`, pure-logic-in-`lib`), real multi-tenancy, disciplined conventions. Actively damaged by the Hobby-tier god-hub and mixed trust boundaries in one file. |
| **Backend** | **6.5/10** | Correct server-side auth, RLS throughout, signature verification everywhere, sensible indexes. Docked for broken rate limiting, the open LLM proxy, the 3-query auth path. |
| **Frontend** | **5.5/10** | Excellent offline/reliability work. No code splitting, no data layer, a 1,412-line page on the money path. |
| **Performance** | **4/10** | Measured: 1,555 kB / 439 kB gzip, one chunk, 21 eager routes, admin-only libraries shipped to field techs. Undermines a marketing pillar. |
| **Security** | **6/10** | Above-average headers, RLS, webhook verification, `timingSafeCompare`. Docked hard for rate-limit theatre, report-only-CSP-with-no-reporter theatre, and the LLM proxy. |
| **UX** | **6.5/10** | Tier 1 mobile work is genuinely good and field-informed. Unvalidated beyond one user; high configuration-driven cognitive load. |
| **Accessibility** | **3/10** | 33 labels / 235 buttons, 8 roles, no focus-management audit, no automated testing. |
| **Scalability** | **5/10** | Postgres + serverless scales fine architecturally. Blocked by Hobby tier, no caching, no queue, and a production DB that cannot be reproduced from migrations. |
| **Maintainability** | **7/10** | 534 tests, enforced conventions, changelog gate, real docs. **The strongest technical dimension.** Docked for the god-hub, dead code, bus factor 1. |
| **Product Quality** | **6.5/10** | The core spine works end-to-end — more than most. Surrounded by unvalidated surface area. |
| **Business Potential** | **6/10** | Right market, right wedge, right price frame, sane unit economics. Zero external validation. |
| **Android Readiness** | **4/10** | Correct engine (PWA→TWA), short path — blocked today by icons, bundle size, legal pages. |
| **Google Play Readiness** | **2/10** | Three hard blockers plus an unanswerable Data Safety form. |
| **Monetisation** | **4/10** | Stripe billing + Connect wired end-to-end (genuinely impressive). Zero validated pricing, no pricing page, no trial, no self-serve. |
| **Overall Product** | **5.5/10** | Well-engineered, over-scoped, entirely unvalidated. |

---

## Phase 10 — Final verdict

**1. Would an investor invest?** **Not yet — but would take a second meeting.** Pre-validation with a strong technical founder, a well-argued wedge, and n=1. Return with five paying strangers at $69 and 60-day retention data and this becomes fundable. The blocker is not the code; the code is better than the stage.

**2. Continue building it?** **Continue owning it; largely stop building it.** ~20 roadmap items shipped in three weeks. Engineering velocity has not been the constraint on this business for a long time.

**3. Solving a real problem?** **Yes.** Missed enquiries cost trade businesses real money and neither incumbent addresses the front door. The least doubtful part of this review.

**4. Feature creep?** **Yes, severe — named in Phase 4.** Social, tasks, Xero (built in violation of the T2.9 gate), workflow-graph observability, 32 switches, 12 Tier-3 items. The switch system is the deepest instance: franchise-grade configurability built before anyone validated the defaults.

**5. Commercially viable?** **Plausibly, at $69/mo, if retention holds.** COGS maths is sound and margin-positive per seat. Retention is the open question, and the add-on positioning makes it harder, not easier.

**6. Should it become an Android app?** **Yes — as a TWA wrapping the existing PWA, for distribution reasons, not technical ones.** No native rewrite. After the Critical list.

**7. Ready today?** **No.** Not for Play (three blockers), not for strangers (no analytics, no legal pages, unreproducible prod DB, founder-led onboarding), not for scale (Hobby tier, in breach).

### Top five changes

1. **Instrument everything** — Sentry + analytics. Every other item is guesswork without it.
2. **Get five paying strangers.** Not a feature. The only thing converting the strategy documents from fiction into data — and it will invalidate a third of the roadmap for free.
3. **Subtract to the spine.** Delete social, tasks, ten Tier-3 items; cut switches toward twelve; default the wedge ON.
4. **Pay for the infrastructure.** ~US$45/mo simultaneously ends a legal breach, removes the constraint that deformed the API architecture, and makes production recoverable.
5. **Build the front door** — landing page, recorded 60-second demo, case study with real numbers. More strategy has been written about these than it would take to produce them.

### The 30-day plan

**Week 1 — Stop the bleeding.** `dd1` Sentry + analytics live. `dd2` Vercel Pro + Supabase Pro + PITR. `dd18` delete social, tasks, `_rateLimit.js`, duplicate manifest. `dd4` fix the limiter. `dd5` close the LLM proxy. `dd7` code-split the routes. *Write no features.*

**Week 2 — Become sellable.** `dd3` privacy policy, terms, in-app account deletion. `dd6` real 512 PNG icon. `dd12` landing page with $69 pricing and a signup form (a form is fine — it does not need to be self-serve); record the 60-second demo cold, twice, on a real phone; pull the client's numbers from `lead_events` and write the one-page case study.

**Week 3 — Market contact.** `dd13` take the demo to twenty solo tradies — local trade Facebook groups, the client's trade-adjacent network, a bookkeeper or two. Charge the first five. Founding price is fine; **zero is not** — free users don't tell the truth about value. Onboard each personally and watch them use it. Note every confusion.

**Week 4 — Respond to reality.** Fix what those five actually hit — which will not be what is on the roadmap. Execute `t27` prod schema reconciliation. *Then*, if and only if the five stick, `dd17` package the TWA and submit to Play.

**Explicitly not in these 30 days:** compliance certificates, recurring jobs, timesheets, native Meta webhook, self-serve signup, card surcharge, MYOB, live tracking — any Tier 3 item at all.

### If this were my company

I would stop treating the roadmap as the product.

What exists here is a governance system — a governing doc, tier gates, per-session discipline, feature-switch conventions, changelog gates — and it is genuinely impressive engineering management for one person. It is also the thing hurting most, because **it makes shipping feel like progress when the actual bottleneck is that nobody outside this repository has ever tried to buy the product.** Twenty items shipped in three weeks, and BUSINESS.md's "Sales assets checklist" still has five unticked boxes, each about a half-day of work.

The tell is T3.1. T2.9 decided — and documented — that Xero live sync stays Tier 3 under the front-door position. Three days later, Xero live sync shipped. Not because a customer asked. Because it was buildable, and building is where the comfort is.

So: freeze the roadmap for 30 days. Run the plan above. Charge five strangers real money. Then let *those five people* write Tier 1, and delete whatever they don't touch.

---

## Verification debt — open questions

Flagged honestly rather than assumed. Each materially moves a score.

1. **Is the current client actually paying, and how much?** No Stripe subscription evidence in the repo. Moves PMF by ±3.
2. **What is real usage?** Leads/week, weekly-active techs, invoices paid through the app. The data is in `lead_events` and `monthly_org_reports` and has never been queried for this purpose.
3. **Have the Tier 1 UATs actually been run?** Nearly every Shipped-log row ends *"browser UAT still owner-run."* If they have not, Tier 1 is unverified on the exact reliability path it was built to fix.
4. **Is Supabase PITR on right now?** If not, that is the single most urgent line in this document and everything else waits. → `dd2`
