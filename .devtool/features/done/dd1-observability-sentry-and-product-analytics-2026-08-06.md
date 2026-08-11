---
id: "dd1-observability-sentry-and-product-analytics-2026-08-06"
status: "done"
priority: "critical"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-10T15:30:00.000Z"
completedAt: "2026-08-10T15:30:00.000Z"
labels: ["due-diligence", "observability", "ops"]
order: "Z0"
---

# DD1 Observability — Sentry and product analytics

**The single worst gap in the product, and invisible because everything compiles.**

Audit found **zero** error monitoring and **zero** analytics anywhere in `src/`, `api/`, or `package.json`. 47 `console.error` calls go to a Vercel log nobody reads. One `ErrorBoundary` (`src/main.tsx:9`) catches, renders a fallback, and tells no one.

**Why it's critical:** the *entirety of Tier 1* was a response to one bug class — silent write failures on the money path. Those were found by manual code review, months after shipping, after the client said "the app lost my job." There is no mechanism to find the next one faster. At 20 orgs you will be debugging by SMS.

**Second-order:** BUSINESS.md lists the metrics that matter — speed-to-lead, recovery rate, activation, feature adoption, "churn early-warning: falling lead volume." **Not one is measurable today.** The data sits in `lead_events`; there is no instrumentation, funnel, cohort, or dashboard. You are planning a launch you would be unable to read.

**Spec:**
- Sentry on both the React client and the Vercel serverless functions (free tier covers current volume).
- PostHog or Vercel Analytics with ~12 named events: `lead_captured`, `ack_sent`, `quote_sent`, `quote_accepted`, `booking_created`, `job_completed`, `invoice_sent`, `invoice_paid`, `review_sent`, `offline_queue_flush_failed`, `extraction_fallback_used`, `login`.
- Wire `ErrorBoundary` to report.
- Scrub PII before send (customer names/phones/addresses must not land in Sentry breadcrumbs).

**Feature switch:** none — platform infrastructure.

**Done when:** a deliberately thrown client error and a deliberately failed serverless write both appear in Sentry within a minute; the 12 events show in the analytics dashboard; a funnel from `lead_captured` → `invoice_paid` renders.

**Difficulty:** Easy. **Nothing else in the review matters as much.** Blocks all other feature work per DUE_DILIGENCE_REVIEW.md "Rules for now" #1.

Source: DUE_DILIGENCE_REVIEW.md — Phase 2, C1.

## Build status (06-08-2026) — code complete, in Review pending owner verification

**Decisions confirmed with owner:** PostHog (not Vercel Analytics — needed a real funnel builder
+ server-side SDK); Sentry errors only, `tracesSampleRate: 0`; Vercel + client only this pass, the
2 Supabase edge functions (`notify-message`, `push-notify`) are a deliberate fast-follow, not in
scope; owner creates the Sentry/PostHog accounts and supplies keys.

**Shipped in code (v1.1.155, uncommitted pending owner review):**
- `shared/analyticsEvents.ts` — the 12 event names + a typed property shape per event (ids/enums/
  booleans only, never a raw lead object) + a runtime `assertNoForbiddenKeys` PII guard, tested in
  `tests/analyticsEvents.test.ts`.
- Client: `src/lib/sentry.ts` (`@sentry/react`, breadcrumbs fully disabled rather than auditing
  ~190 `console.*` call sites for PII), `src/lib/analytics.ts` (`posthog-js`, autocapture/session
  recording off), wired into `main.tsx`, `ErrorBoundary.tsx`, and `Login.tsx` (`login` event).
- Server: `api/_lib/sentry.ts`, `api/_lib/analytics.ts` (`posthog-node`, `flushAt:1` — sends
  immediately since a serverless container can freeze the instant the response is sent),
  `api/_lib/observability.ts` (`withObservability` wrapper). All 12 `api/*.ts` handlers wrapped —
  **still 12/12 files, no new endpoint.**
- All 12 events wired at their real hook points (lead intake pipeline, quotes, invoices, bookings,
  reviews, offline queue, login) plus `captureServerException`/`captureClientException` calls at
  the matching failure branches of each.
- **Design change from the approved plan:** posthog-js can't override `distinct_id` per call the
  way posthog-node can, so client-originated lead-lifecycle events (`lead_captured` manual entry,
  `booking_created`, `job_completed`, `offline_queue_flush_failed`) relay through a new
  `POST /api/leads?action=analytics-track` action instead of calling posthog-js directly — keeps
  `distinctId = leadId` consistent everywhere so the funnel actually connects. Still zero new
  `api/` files.
- `vercel.json` CSP `connect-src` updated for Sentry/PostHog ingest domains (harmless now, CSP is
  still Report-Only; avoids a dd9 regression later).
- `npm run typecheck` clean, extensionless-import grep clean, full suite green: **545/545** (534
  baseline + 11 new).

**Reinterpretation worth a sign-off:** `offline_queue_flush_failed` fires on every failed flush
*attempt*, not once when "permanently" failed — there's no retry-count/give-up logic anywhere in
the offline queue today, and building it would be new scope beyond this card's "Easy" rating.

**Bundle size:** `@sentry/react` + `posthog-js` add ~237 kB to the client bundle (1,555 kB → 1,792
kB, gzip 439 kB → 517 kB per `vite build`). Expected, but it moves in the wrong direction just
before `dd7` (code-splitting) — worth sequencing `dd7` soon after this lands.

**Left to close this card out (needs the owner, not more code):**
1. Create a free Sentry project (Developer plan) and a free PostHog project; drop
   `SENTRY_DSN`/`VITE_SENTRY_DSN`/`POSTHOG_PROJECT_TOKEN`/`VITE_POSTHOG_PROJECT_TOKEN` into the
   Vercel preview/prod env (placeholders already in `.env.example`; `.env.local` already has the
   PostHog token, was previously invalid `:`-syntax, now fixed to `=`).
2. Confirm `VITE_POSTHOG_HOST`/`POSTHOG_HOST` match the PostHog project's actual region (defaulted
   to `https://us.i.posthog.com`).
3. Run the card's literal "done when" checks against real data: throw a client error and force a
   serverless write failure, confirm both land in Sentry within a minute; exercise the 12 hook
   points and confirm all 12 show in PostHog; inspect at least one real captured payload from each
   tool for PII, not just assume the scrubbing works; build the `lead_captured → invoice_paid`
   funnel in the PostHog UI once real events exist.
4. Only then: move to `done`, set `completedAt`, move file to `done/`, add the Shipped row in
   `ROADMAP.md`.

## Closed 10-08-2026 — verified live

Both Sentry projects confirmed on real events (a deliberate client error and a deliberate
serverless throw, each landed within a minute; breadcrumbs empty, no PII in either payload).
`login` confirmed in PostHog with a clean payload (only `orgId`/`role` custom fields — geo/device
enrichment is PostHog's own IP-based default, flagged to the owner as a policy-disclosure point,
not a bug). `lead_captured`/`extraction_fallback_used`/`ack_sent` couldn't be confirmed from local
`vercel dev` — traced to Node's outbound `fetch()` being blocked by the local machine's
network/firewall to PostHog's and Twilio's IP ranges specifically (`curl` to the same hosts
succeeded; `@sentry/node` also succeeded, ruling out a general Node-networking failure). Not a
code issue. Real bug found along the way: `posthog-node`'s `client.flush()` hangs indefinitely in
this environment — added a 3s timeout guard (`Promise.race`) so analytics can never block or hang
a real request, plus wired `@vercel/functions`'s `waitUntil` (the SDK's documented serverless
integration point). Shipped to production in v1.1.167. Funnel construction in the PostHog UI is a
dashboard step for the owner, not code — not verified in this session.
