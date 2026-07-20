# FieldBourne — Tech & App Overview

| Field | Value |
|-------|-------|
| **Product** | FieldBourne — multi-tenant field service CRM PWA for Australian trade businesses |
| **Status** | MVP in production with one paying client (TV Magic South Brisbane); polish phase before marketing |
| **Version** | v1.1.140 (20-07-2026) — Tier 2 shipped (prod schema reconcile still operator-run); T1.10 deferred |
| **Repo** | `tv-magic-companion` (rename pending — roadmap T2.3) |
| **Related docs** | [ROADMAP.md](../ROADMAP.md) (governing) · [T1_TESTING.md](../T1_TESTING.md) · [MUST_HAVE_8_ROADMAP.md](MUST_HAVE_8_ROADMAP.md) · [SALES_PIPELINE_WORKFLOW.md](SALES_PIPELINE_WORKFLOW.md) · [SALES_PIPELINE_BACKLOG.md](../SALES_PIPELINE_BACKLOG.md) · [MARKETING.md](MARKETING.md) · [BUSINESS.md](BUSINESS.md) · [ONBOARDING_RUNBOOK.md](ONBOARDING_RUNBOOK.md) · Branding: owner's separate guide |

## Stack

- **Frontend:** React 19 + Vite, Tailwind CSS v4, installable PWA (`vite-plugin-pwa`), React Router 7. Recharts (reports), @dnd-kit (desktop kanban), @xyflow (workflow-run graphs).
- **Backend:** Vercel serverless functions — **11 of a hard 12-function Hobby cap** used. New endpoints must be `?action=` additions to existing hubs (`api/send-sms.ts`, `api/stripe.ts`, …) with `vercel.json` rewrites for pretty URLs. Never add a new file under `api/` root.
- **Database:** Supabase Postgres with org-scoped RLS everywhere. Prod project `abnheynzugpicikxwwmv`, dev project `rkzgikxxxmovqisxusae`. Two Deno edge functions: `notify-message` (support-messaging push, real), `push-notify` (unused scaffold — delete when convenient).
- **Integrations:** Twilio (SMS + WhatsApp), CloudMailin (inbound email/voicemail/missed-call), Resend (transactional email), Stripe (two separate integrations: SaaS subscription billing for orgs, and Connect Standard for customer invoice payments — separate webhook secrets), OneSignal (push), Anthropic Claude (lead extraction, caption generation), Botpress/Make (Facebook Messenger lead path), Zernio (social posting — parked).
- **Background jobs:** GitHub Actions cron (`.github/workflows/contact-follow-up-cron.yml`) POSTs `/api/cron/contact-follow-up` every 15 min → consolidated sweep chain (contact follow-up, invoice chase, quote chase, booking reminder, workflow-run purge) with `cron_heartbeats` health signal. pg_cron handles lead-pool expiry. **The cron hits PROD**, not preview.
- **Testing:** vitest — 76 files / 452 tests; `npm run typecheck` (app + node tsconfigs) is a hard prebuild gate. `tests/` is *not* yet under typecheck (known debt, T2.8).

## Architecture

- **Multi-tenancy:** `brands` (template layer: colors, SMS/email templates, upsells) → `orgs` (franchisees/businesses; own colors, ABN, GST flag, Stripe accounts) → `profiles` (users; roles `platform_admin` / `manager` / `employee`).
- **Feature switches:** 26 per-brand switches in `shared/featureSwitchCatalog.ts` + `feature_flag_catalog` table, resolved brand-value → catalog-default → code-default, with tier gating (basic/pro/enterprise). **Rule: every switch must gate server endpoints, not just UI.** Most default OFF — new orgs need a preset (roadmap T2.6).
- **Operation modes:** `solo` (Inbox/In-progress/Done, auto-assign inbound) vs `team` (pool + countdown timers + contact rounds + workload/proximity auto-assign).
- **Offline architecture:** IndexedDB queue (`tvm-offline-queue`) for contact attempts, photos, completions, contact notes; FIFO replay with per-item try/catch and a status re-read conflict guard on completions. Read-through cache of the last leads/calendar fetch (per user, 12h TTL) renders when a fetch fails. `fetchWithTimeout` (10s → friendly `NetworkError`) + module-level toast store (`src/lib/toast.ts` + `ToastHost`) for write-failure surfacing.
- **Sales pipeline (10 stages):** capture → extraction → acknowledgment → quoting → booking → execution → invoicing → payment → reconciliation → review. Stages 1–2 live; Stage 3 built but shipped dark; 4–9 exist as features with manual hand-offs; closed-loop automation is roadmap T2.1. Reference: `docs/SALES_PIPELINE_WORKFLOW.md` (versioned; must be updated in the same PR as any pipeline behaviour change).

## What the app does today (condensed)

- **Capture:** inbound SMS / email / voicemail / missed-call / Facebook Messenger / manual + AI paste-parse; raw-first insert (lead saved even if AI fails); DID/plus-tag org routing; unrouted-inbound capture + alert.
- **Extraction:** Claude with deterministic fallback, `extraction_status` badge + manager retry, voicemail enrichment.
- **Lead management:** kanban (unassigned → assigned → contact_attempted → booked → completed/lost/booking_cancelled), pool countdown timers with pg_cron auto-return, contact rounds with auto-lost, smart/auto-assign, soft delete with audit, photos on active jobs, duplicate detection, customer linking + previous-jobs history.
- **Booking:** calendar + booking modal, confirmation SMS/email with `.ics`, day-before reminder (quiet-hours aware), cancellation.
- **Quoting:** price-list favourite chips, line items, GST-aware, SMS quote link, public e-sign accept/decline page, automated quote chase.
- **Invoicing/payment:** one-tap ATO-compliant Tax Invoice (ABN, divide-by-11 GST), Stripe Connect "Pay Now" with webhook auto-mark-paid, public invoice status page, overdue chase ladder, Xero-compatible CSV export.
- **Post-job:** completion checklist (draft-resumable, trade-neutral) with upsells, manual review-request SMS.
- **Team/admin:** activity feed, tech GPS, reports + monthly snapshots, internal support messaging with push, Platform Admin (orgs/brands, switches, template editors, workflow-run observability, inbound simulator, lead trace, test profiles).
- **Platform SaaS:** Stripe subscription billing (basic/pro/enterprise) + manual tier override.

## Environments & operations

- **Prod:** deploys via `vercel deploy --prod` from `main`; app at `tv-magic-companion.vercel.app`. Only real org: TV Magic South Brisbane. FieldBourne + Solo Test orgs in prod are demos.
- **Preview:** `vercel deploy --yes` (working tree) → preview URL against **dev** Supabase. Prebuild gate: changelog version === package.json version + weekly changelog entry + clean typecheck.
- **Prod DB changes:** via Supabase Management API (pooler cert is self-signed). Prod was stood up by cutover script, **not** migrations — `supabase/migrations/` is not a faithful description of prod until the `supabase/RECONCILIATION.md` runbook is executed (roadmap T2.7). **Hazard:** migration timestamp prefixes mix 2025/2026 out of authoring order; must be resolved before any bulk `db push`.
- **Deploy gotcha:** extensionless relative imports in `api/`/`shared/` pass local typecheck but 500 the entire function hub at runtime on Vercel (raw Node ESM). Pre-deploy grep: `rg -n "(from|import)\s+'\.\.?/[^']*'" -g '*.ts' api shared | rg -v "\.js'|\.json'|\.css'"` must be empty.

## Conventions (every change)

1. Anything not on [ROADMAP.md](../ROADMAP.md): push back, confirm with owner, add to the doc first.
2. Ask whether a per-brand feature switch is needed; switches gate server endpoints.
3. Bump `src/lib/changelog.ts` + `package.json` together (verify with `npm run verify:changelog`).
4. Pipeline behaviour changes update + version-bump `docs/SALES_PIPELINE_WORKFLOW.md` in the same PR.
5. Pure logic → `src/lib/` or `shared/` with vitest tests in `tests/`.
6. `shared/` files must not import Vite/env or browser-generated types (compiled by both api and app).

## Roadmap snapshot (18-07-2026)

Governing doc: [ROADMAP.md](../ROADMAP.md). Three tiers:

- **Tier 1 — client retention (field reliability):** T1.1–T1.9 **built, on preview, awaiting owner UAT** (T1.6 partial: org-configurable checklist + SMS-invoice-without-email deferred). T1.10 (enable Stage-3 ack switches in prod) **deferred** pending manager approval.
- **Tier 2 — stranger-ready:** **T2.1 closed-loop shipped** (Package 6). Remaining: 60-second demo environment, FieldBourne shell rebrand, onboarding tips (Package 8), customer CSV import, new-org switch preset + provisioning runbook, prod schema reconciliation, engineering hygiene batch, positioning/pricing decision gate.
- **Tier 3 — positioning-dependent:** Xero live sync, compliance certificates, recurring jobs, timesheets/costing, native Meta bot, social revive-or-remove, POs, live tracking, MYOB, cross-device drafts, self-serve signup, card surcharge.

## Known debt (validated 18-07-2026)

TVMagic shell branding across ~15 surfaces (T2.3); stock Vite README; prod schema drift + migration-prefix hazard (T2.7); legacy `FEATURES` tier map coexisting with the switch catalog, BillingPanel advertising a dead `/tasks` route; orphaned `TaskBoardPage.tsx`, dead `usePushNotifications`/`web-push`, buggy unused `SignatureCanvas.tsx`; `tests/` outside typecheck with 3 latent errors; `SALES_PIPELINE_BACKLOG.md` checkboxes stale vs shipped reality; unused `push-notify` edge-function scaffold deployed. Full detail + evidence in ROADMAP.md T2.8 and the memory notes.
