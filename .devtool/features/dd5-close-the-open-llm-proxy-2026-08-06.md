---
id: "dd5-close-the-open-llm-proxy-2026-08-06"
status: "review"
priority: "critical"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-06T20:30:00.000Z"
completedAt: null
labels: ["due-diligence", "security", "cost", "backend"]
order: "Z4"
---

# DD5 Close the open LLM proxy

`api/anthropic.ts:48-72` accepts an **arbitrary `messages` array from the client** and forwards it verbatim to Claude on the platform API key — clamped only to 2000 tokens and the broken rate limiter (see `dd4`).

**Impact:** any authenticated user on any Pro-tier org — a customer, an ex-employee with a live session, anyone who lifts a token from devtools — has a free general-purpose LLM billed to your account. Not a data breach; a **cost, abuse, and content-liability vector**. There is no cap on spend and (until `dd1`) no alerting to notice it happening.

**The fix already exists in the codebase.** `api/_lib/extractLead.ts` does this correctly: the server constructs the prompt. The generic proxy is a legacy path that should not exist.

**Spec:**
- Enumerate every caller of `/api/anthropic` (client-side paste-parse in `EmailParser.tsx`, caption generation in `src/lib/generateCaption.ts`, others — grep before assuming).
- Replace each with a purpose-built server action taking structured input only: `{ leadId, rawText }`, `{ leadId, tone }`, etc. Server owns the prompt, the model id, and the token budget.
- Delete the generic `messages` passthrough entirely.
- Add a per-org monthly token/spend ceiling while you're in there.
- If `dd19`/`dd18` remove social posting, `generateCaption` goes with it — check before migrating that caller.

**Feature switch:** none new — respects existing `ai_parsing` tier gate.

**Done when:** no endpoint accepts a client-supplied prompt or `messages` array; every Claude call builds its prompt server-side; a spend ceiling exists per org.

**Difficulty:** Medium — the work is finding and migrating callers, not the endpoint itself.

Source: DUE_DILIGENCE_REVIEW.md — Phase 2, C3.

## Build status (06-08-2026) — code complete, in Review pending a live-key smoke test

**Callers found (exactly the two the card expected):** `src/components/EmailParser.tsx` (paste-parse
extraction) and `src/lib/generateCaption.ts` (social caption generation). Neither `dd18` nor `dd19`
has actually removed social posting yet, so `generateCaption` was migrated rather than skipped.

**Shipped in code (v1.1.157, uncommitted pending owner review):**
- `api/anthropic.ts` rewritten as an action-dispatch hub (`?action=extract-lead-fields` /
  `?action=generate-caption`), each taking only structured input (`{ rawText }` /
  `{ jobContext, notes }`). **The generic `messages` passthrough is deleted entirely** — there is
  no code path left that forwards client-supplied prompt content to Claude.
- `api/_lib/aiPrompts.ts` — the two prompts, extracted as pure functions (server owns the model,
  the exact wording, and now a hard input-length clamp too), unit-tested in `tests/aiPrompts.test.ts`.
- `api/_lib/aiUsage.ts` + `supabase/migrations/20260806160000_ai_usage_monthly.sql` — a per-org
  monthly token ceiling (env `AI_MONTHLY_TOKEN_CEILING`, default 200,000; tune per franchise once
  there's real usage data). This is a **soft cost/abuse guard, not a security boundary** like
  `dd4`'s limiter — the pre-spend check is a plain read, not atomic, which is an acceptable trade
  here (worst case a few concurrent requests at the exact monthly boundary slip through).
- Both callers updated to send structured bodies and consume `{ fields }` / `{ caption }`
  responses instead of raw Claude message objects; dead client-side model-selection code
  (`getClaudeModel()` in `EmailParser.tsx`, reading `VITE_CLAUDE_MODEL`) deleted since the model is
  now a server decision.
- `npm run typecheck` clean, extensionless-import grep clean, `vite build` succeeds, full suite
  green: **558/558**.

**Left to close this card out (needs a live Anthropic key, not more code):**
1. Smoke-test both actions against a real `ANTHROPIC_API_KEY` (paste an email through
   EmailParser, generate a caption) — confirm the JSON extraction still parses cleanly and the
   caption still reads as one written by a person, not just that the request round-trips.
2. Apply `20260806160000_ai_usage_monthly.sql` to dev Supabase (bundle with dd4's migration).
3. Only then: move to `done`, add the Shipped row in `ROADMAP.md`.

(Re-grepped `src/` for every `/api/anthropic` reference after migrating both callers — confirmed
exactly the two above, nothing else hits this endpoint.)
