---
id: "dd4-fix-broken-rate-limiting-2026-08-06"
status: "review"
priority: "critical"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-06T20:10:00.000Z"
completedAt: null
labels: ["due-diligence", "security", "backend"]
order: "Z3"
---

# DD4 Fix broken rate limiting

Rate limiting today is protection theatre. Four copies of the same broken limiter, plus a fifth dead one:

- `api/anthropic.ts:6-17`
- `api/send-sms.ts:35`
- `api/geocode.ts:7`
- `api/social-post.ts:6`
- `api/_rateLimit.js` — **a `.js` file containing TypeScript generics** (`Map<string, { count: number; reset: number }>`). It would be a runtime syntax error if imported. Nothing imports it.

Each declares `const rateLimitMap = new Map()` at **module scope**.

**Why it fails:** this is serverless. Every concurrent Lambda instance gets its own Map; every cold start wipes it. The effective limit is `10 × (however many instances Vercel spins up)` — i.e. **unbounded under exactly the burst traffic a limiter exists to stop.** It passes a code review and stops nothing.

## Spec

- One shared limiter in `api/_lib/`, backed by Postgres (honest at this scale — the DB is already there) or Upstash Redis.
- Key on `orgId` + `userId` for authenticated routes, IP for public ones. Note `x-forwarded-for` is client-controllable behind some proxies — prefer the authenticated identity where one exists.
- Apply to: `anthropic`, `send-sms`, `geocode`, all public quote/invoice endpoints, `push-rotate`.
- Delete all five existing copies including `api/_rateLimit.js`.

**Feature switch:** none.

## Done when

- [ ] A burst from multiple concurrent connections is actually throttled — verify with a **parallel**-request script, not a serial loop (a serial loop passes even today).
- [ ] Zero module-scope `rateLimitMap` remains.
- [ ] `api/_rateLimit.js` is deleted.

**Difficulty:** Easy–Medium.

Source: DUE_DILIGENCE_REVIEW.md — Phase 2, C2.

## Build status (06-08-2026) — code complete, in Review pending live-traffic verification

**Correction to the audit:** the review undercounted — there were actually **six** broken
module-scope copies, not four: `anthropic.ts`, `send-sms.ts`, `geocode.ts` (x2 call sites),
`social-post.ts`, `inbound-sms.ts`, and `send-support-email.ts`, plus the dead `_rateLimit.js`.
All fixed/deleted.

**Also found and fixed, beyond the card's literal list:** `quote-public-get`, `quote-public-accept`,
`quote-public-decline`, `invoice-public-get`, and `push-rotate` had **zero** rate limiting at all
(dispatched before the auth gate in `send-sms.ts`) — the highest-risk group, since these are
guessable-token-protected, not session-protected. `stripe.ts`'s `invoice-pay` (public GET, clicked
from an email link) was the same. All six now rate-limited.

**Shipped in code (v1.1.156, uncommitted pending owner review):**
- `supabase/migrations/20260806150000_rate_limits.sql` — `rate_limit_hits` table (RLS enabled, no
  policies — service-role only) + an atomic `increment_rate_limit()` Postgres function
  (`INSERT ... ON CONFLICT ... DO UPDATE`, single statement, race-free under concurrent hits —
  a plain select-then-update from the client would have reintroduced the exact race being fixed).
- `api/_lib/rateLimit.ts` — `checkRateLimit()` (fixed-window, keyed `scope:identifier`),
  `rateLimitIdentifier()` (prefers authenticated identity over client-controllable
  `x-forwarded-for`), `purgeOldRateLimitHits()`. Fails open on a DB error (logged, not silent) so
  a Supabase blip never takes the protected endpoint down with it.
- Purge wired into the existing `contact-follow-up` cron sweep chain in `api/send-sms.ts` — no new
  cron endpoint.
- `tests/rateLimit.test.ts` covers the pure window-bucketing and identifier logic.
- `scripts/verify-rate-limit.mjs` — fires genuinely concurrent requests and checks for real 429s;
  **a serial loop passes even with the old broken limiter**, so this is the only test that means
  anything for the actual bug.
- `npm run typecheck` clean, extensionless-import grep clean, full suite green: **550/550**.

**Left to close this card out (needs a live target, not more code):**
1. Apply the migration to dev Supabase (and prod, once the dd2 upgrade path is sorted — this
   doesn't depend on dd2, just sequencing).
2. Run `node scripts/verify-rate-limit.mjs <url> <concurrency>` against a running instance
   (`vercel dev` locally, or a preview deploy) and confirm real 429s appear under a concurrent
   burst — this is the card's actual "done when" criterion, and nothing here proves it without
   hitting a live endpoint with a real Postgres behind it.
3. Only then: move to `done`, add the Shipped row in `ROADMAP.md`.
