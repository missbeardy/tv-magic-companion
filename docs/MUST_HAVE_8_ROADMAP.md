# Must-Have 8 Roadmap

| Field | Value |
|-------|-------|
| **Purpose** | Table-stakes feature roadmap to make this product sellable to small Aussie trade teams (2–10 people) |
| **Execution model** | One package per session, strictly in order, by Claude Sonnet |
| **Last updated** | 16-07-2026 — Package 4 shipped |

## Owner intent (verbatim items)

1. Card / Pay Now on invoice (pipeline stages 8–9) — table stakes for "modern".
2. Xero or MYOB sync (or honest "CSV export + BSB until Xero") — accountants block purchases without a story.
3. Closed quote→book→invoice→pay→review automation — this is the product promise.
4. True mobile field day — photos, notes, complete, invoice without desktop; offline queue.
5. Customer confirmation on book + reminder day-before.
6. GST-aware quotes/invoices + ABN on PDF.
7. Price list / favourites for 10–20 common jobs (not full supplier integration).
8. Onboarding in-app for pool timer + contact rounds (bespoke edge fails without training).

## Locked decisions

- **Build order = dependency order** (below). GST/ABN and price-list line items are foundations that Pay Now, CSV export, and invoice rendering all build on — do them first so nothing downstream gets reworked.
- **Payments = Stripe Connect Standard.** Each tradie owns/creates their own Stripe account via Stripe-hosted onboarding (owns payouts + disputes); the platform runs one Connect webhook for all orgs; lazy Checkout Sessions (created on-demand from the invoice link, not pre-generated).
- **Accounting v1 = Xero-compatible CSV export** + the existing free-text BSB/PayID instructions. Xero OAuth/live sync is explicitly deferred — do not build it as part of this roadmap.

## Instructions for the executing session

- Work **strictly one package per session**, in the order below. Do not skip ahead or combine packages.
- Before opening files, re-read that package's cited file paths and confirm they still match reality (things may have shifted since this doc was written) — trust the doc's architecture reasoning, verify its file-path claims.
- Tick the checklist item and update **Last updated** above when a package ships.
- Follow the **Global constraints** below in every package without exception.

## Global constraints

- **Vercel Hobby 12-function limit — 11 of 12 already used.** Never add a new file under `api/` root. Add actions to existing hubs (`api/stripe.ts`, `api/send-sms.ts`) plus `vercel.json` rewrites for pretty URLs. Keep the 12th slot free.
- **The external cron scheduler is not in this repo.** `/api/cron/contact-follow-up` (rewrite → `send-sms?action=contact-follow-up`, auth via `CRON_SECRET`) runs the consolidated sweeps: contact follow-up reminders, invoice chase, quote chase, workflow-run purge. Verify externally that something actually calls this URL on a schedule before building anything that depends on a sweep (see Package 5, Step 0) — if it isn't configured, invoice/quote chase have likely never fired either.
- **RLS**: every new table copies the org-scoped policy pattern from `supabase/migrations/20250704120000_invoices.sql`. Public token pages (quote accept, invoice pay) go through server actions only — never client-side Supabase queries against org data.
- **Conventions**:
  - New feature switch → migration into `feature_flag_catalog` + entry in `shared/featureSwitchCatalog.ts` (key, category, min_tier).
  - Any pipeline behaviour change → update **and version-bump** `docs/SALES_PIPELINE_WORKFLOW.md` in the same PR (see that doc's own maintenance policy).
  - Any release → bump `src/lib/changelog.ts` and `package.json` version.
  - Pure logic (calculations, policy decisions, sequencing) → extracted into `src/lib/` or `shared/` with vitest tests in `tests/`, not buried in components/handlers.

## Progress checklist

- [x] Package 1 — GST-aware quotes/invoices + ABN (Item 6, S/M)
- [x] Package 2 — Price list / favourites + line items (Item 7, M)
- [x] Package 3 — Card / Pay Now on invoice (Item 1, L)
- [x] Package 4 — Xero-compatible CSV export + BSB story (Item 2, S/M)
- [ ] Package 5 — Booking confirmation + day-before reminder (Item 5, S/M) — **note:** the `booking_confirm` toggle prerequisite already shipped as an out-of-sequence fix (see `docs/SALES_PIPELINE_WORKFLOW.md` v1.5.0); this package's remaining scope is the day-before reminder sweep only
- [ ] Package 6 — Closed-loop quote→book→invoice→pay→review (Item 3, M)
- [ ] Package 7 — True mobile field day / offline extension (Item 4, M)
- [ ] Package 8 — In-app onboarding: pool timer + contact rounds (Item 8, S)

---

## Package 1 — GST-aware quotes/invoices + ABN

**Item 6 · Size S/M**

**Goal.** Quotes and invoices carry a real GST component and the org's ABN. Invoice email (and any future PDF) is ATO-compliant: "Tax Invoice" title, ABN formatted `NN NNN NNN NNN`, "Total includes GST of $X" — or a plain "Invoice" with no GST line when the org isn't GST-registered (real scenario: sole-trader tradies under the $75k threshold).

**Verified current state.** "Total incl. GST" is a cosmetic label only (`src/components/QuoteComposerModal.tsx` ~L256, `src/pages/QuoteAcceptPage.tsx` ~L161/196) — there is no `gst_amount`/`tax_rate` column anywhere, and no ABN field anywhere in the schema.

**Model.** Keep `total_amount` as the gross (GST-inclusive) figure — matches how tradies already quote and matches the existing label. Add a **stored** `gst_amount` column, computed at write time as `round(total_amount / 11, 2)` (the standard Australian divide-by-11 rule for GST-inclusive totals) so historical rows stay immutable even if the calculation logic later changes. Add `orgs.abn text` and `orgs.gst_registered boolean NOT NULL DEFAULT true`. ABN lives on **orgs** (the legal entity), not brands (marketing identity) — if a multi-brand org later turns out to span multiple legal entities, add a `brands.abn` override then; don't build it speculatively now.

**Migration.**
```sql
ALTER TABLE quotes ADD COLUMN gst_amount numeric(12,2);
ALTER TABLE invoices ADD COLUMN gst_amount numeric(12,2);
ALTER TABLE orgs ADD COLUMN abn text;
ALTER TABLE orgs ADD COLUMN gst_registered boolean NOT NULL DEFAULT true;
```
`gst_amount` stays nullable — null means "pre-GST-era row", render conditionally rather than backfilling.

**Files to touch (reuse, don't rebuild).**
- New `shared/gst.ts`: `gstComponentOf(grossCents)`, `formatAbn(raw)` (groups as `NN NNN NNN NNN`), ABN 11-digit format validation. New `tests/gst.test.ts` covering rounding edge cases (e.g. $180 → $16.36).
- `api/_lib/quotes.ts` `createQuote` — persist `gst_amount` at write time.
- `api/_lib/invoices.ts` `createAndSendInvoice` — persist `gst_amount` at write time.
- `src/lib/invoiceTemplates.ts` — render "Tax Invoice"/"Invoice" title, ABN line, GST line, conditional on `orgs.gst_registered`/`orgs.abn` presence.
- `src/components/QuoteComposerModal.tsx` (~L256) and `src/pages/QuoteAcceptPage.tsx` (~L161, ~L196) — show the real GST component under the total instead of the cosmetic label.
- `src/components/InvoiceStep.tsx` — show GST in the review step.
- Org settings UI — add ABN + GST-registered fields. Locate the existing settings surface via a search for `invoice_payment_instructions` (it's edited somewhere in org/brand settings already).

**Feature switch.** None — GST/ABN correctness on a tax invoice isn't optional functionality to gate. Behaviour is entirely driven by the `gst_registered` flag and whether `abn` is set.

**Verify.**
- Unit tests: divide-by-11 rounding across representative amounts including cent-boundary cases; ABN formatting/validation.
- Manual: create a quote → accept page shows the real GST component; complete a job → invoice email shows "Tax Invoice", ABN, and the GST line; toggle `gst_registered` off for a test org → renders plain "Invoice" with no GST line.
- Update `docs/SALES_PIPELINE_WORKFLOW.md` (stages 4 Quoting and 7 Invoicing) + version bump + changelog entry.

---

## Package 2 — Price list / favourites + line items

**Item 7 · Size M**

**Goal.** An org maintains 10–20 favourite priced jobs; composing a quote or invoice becomes tap-to-add instead of typing a number. Quote line items flow through to the invoice. Explicitly **not** a supplier/materials catalog — just favourites.

**Verified current state.** No price-list concept exists (the word "catalog" in this repo means `feature_flag_catalog`, unrelated). Quotes have a single flat `total_amount` with no line items. Invoices have `line_items jsonb` in the schema but the UI (`src/components/InvoiceStep.tsx`) only ever captures **one** free-text `{label, amount}` entry.

**Model.** New org-scoped `price_list_items` table. Add `quotes.line_items jsonb` matching the shape invoices already use — `[{label, amount}]`, amounts gross/GST-inclusive per Package 1. `total_amount` stays the authoritative field everywhere it's already consumed (chase policy, `resolveInvoiceAmount`, accept page); line items are additive detail the UI re-sums into `total_amount` when used. The existing free-text single-amount flow must keep working unchanged (`line_items` nullable).

**Migration.**
```sql
CREATE TABLE price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id),
  label text NOT NULL,
  description text,
  amount numeric(12,2) NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  usage_count int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: copy the org-scoped SELECT/write policy pattern from invoices (20250704120000_invoices.sql)

ALTER TABLE quotes ADD COLUMN line_items jsonb;
```

**Files to touch (reuse, don't rebuild).**
- `src/components/QuoteComposerModal.tsx` — add price-list chips + a multi-line editor that re-sums into `total_amount`; keep the current default-`'180'` single-amount path intact.
- `src/lib/quoteDraft.ts` — extend the autosave draft shape to include line items.
- `src/components/InvoiceStep.tsx` — lift the current one-line cap to a small editable list, fed by the same price-list chips.
- `src/lib/resolveInvoiceAmount.ts` + `api/_lib/invoices.ts` — when creating an invoice from an accepted quote, carry the quote's `line_items` across (currently only the flat amount is pulled).
- `api/_lib/quotes.ts` `createQuote` — accept `line_items` on write.
- `src/pages/QuoteAcceptPage.tsx` and `src/lib/invoiceTemplates.ts` — render multiple lines when present.
- New settings component for price-list CRUD (label, amount, active/inactive, reorder).
- New `src/lib/priceList.ts` — fetch active items sorted by `usage_count desc`; fire-and-forget increment `usage_count`/`last_used_at` when a chip is used. New tests: total re-sum from line items; quote→invoice line-item copy.

**Feature switch.** New `price_list` (category `sales_job_completion`, min_tier `basic`) — gates the chips UI. Multi-line editing itself can ship unswitched since it degrades gracefully to today's one-line behaviour when the list is empty.

**Verify.**
- Unit tests: re-sum correctness; quote→invoice line-item carry-through.
- Manual: create 3 price-list items → build a quote via chips → accept → one-tap invoice shows the same lines → invoice email renders the lines plus GST from Package 1.
- Update `docs/SALES_PIPELINE_WORKFLOW.md` (stages 4, 7) + version bump + changelog.

---

## Package 3 — Card / Pay Now on invoice

**Item 1 · Size L — consider splitting Connect onboarding and the pay flow across two sessions if it runs long**

**Goal.** The invoice email carries a "Pay Now" button; the customer pays by card; a webhook automatically marks the invoice paid. This is what makes pipeline stages 8 (Payment) and 9 (Reconciliation) real for the first time.

**Verified current state.** `invoices.paid_via` has a `CHECK` constraint that allows **only** `'manual'` (`supabase/migrations/20250704120000_invoices.sql` L27). Marking paid is a manager-only manual action (`markInvoicePaid` in `api/_lib/invoices.ts`). Stripe exists in this codebase (`api/stripe.ts`, `api/_lib/stripe.ts`) but **only** for the platform's own SaaS subscription billing of orgs (checkout/portal/webhook against `orgs.stripe_customer_id`) — there is no job-payment provider integration of any kind.

**Approach.** Stripe **Connect Standard**: each tradie connects (or creates) their own Stripe account via Stripe-hosted onboarding — they own payouts and disputes, which is the right posture for a platform selling to many independent small businesses. Use **direct charges** on the connected account. Create Checkout Sessions **lazily** (on click, not pre-generated, so links never go stale):

1. Invoice gets a `public_token` (mirror the pattern already used for quotes).
2. Email "Pay Now" button links to `GET /api/stripe?action=invoice-pay&token=<invoice public_token>`. Handler validates the invoice is `sent` and unpaid and the org is connected, creates a Checkout Session on the connected account (currency AUD, amount = `total_amount`, description = invoice number + first line-item label, `metadata: {invoice_id, org_id}`, success/cancel URLs pointing at a new public `/invoice/:token` status page), then 302-redirects to Stripe.
3. **One platform Connect webhook** (new action `connect-webhook` on `api/stripe.ts`, distinct from the existing SaaS-billing webhook action, with its own signing secret `STRIPE_CONNECT_WEBHOOK_SECRET`) handles `checkout.session.completed` → calls `markInvoicePaid(invoice_id, 'stripe')`, idempotent (no-op if already paid).
4. Keep the existing free-text BSB/PayID payment instructions in the email as a fallback and for orgs that haven't connected Stripe.
5. No card surcharge in v1 (Australian rules cap surcharges at the actual cost of acceptance — absorb the fee for now); an optional `card_surcharge_percent` org setting is a documented fast-follow, not part of this package.

**Migration.**
```sql
-- paid_via check constraint has an auto-generated name; look it up (e.g. via
-- \d invoices or a query against pg_constraint) before dropping it.
ALTER TABLE invoices DROP CONSTRAINT <paid_via_check_name>;
ALTER TABLE invoices ADD CONSTRAINT invoices_paid_via_check
  CHECK (paid_via IS NULL OR paid_via IN ('manual', 'stripe'));

ALTER TABLE invoices ADD COLUMN public_token text UNIQUE;
ALTER TABLE invoices ADD COLUMN token_expires_at timestamptz;
ALTER TABLE invoices ADD COLUMN stripe_checkout_session_id text;
ALTER TABLE invoices ADD COLUMN stripe_payment_intent_id text;

ALTER TABLE orgs ADD COLUMN stripe_connect_account_id text;
ALTER TABLE orgs ADD COLUMN stripe_connect_status text;
```
`token_expires_at` should default to a long window (e.g. 90 days) — unlike quote tokens, invoices can legitimately be paid weeks later.

**Files to touch (reuse, don't rebuild).**
- `api/stripe.ts` + `api/_lib/stripe.ts` — add three actions: `connect-onboard`, `invoice-pay`, `connect-webhook`.
- New `api/_lib/invoiceStripe.ts` — Checkout Session creation + webhook fulfilment logic, written as testable pure-ish functions (not inline in the handler).
- `api/_lib/invoices.ts` — `markInvoicePaid` gains a `paid_via` parameter and an idempotency guard; invoice creation generates `public_token`.
- `src/lib/invoiceTemplates.ts` — Pay Now button in the invoice email.
- `api/_lib/invoiceChaseTemplates.ts` — include the pay link in overdue-chase messages too (high value, cheap add).
- New `src/pages/InvoiceStatusPage.tsx` — public `/invoice/:token` page modeled directly on `src/pages/QuoteAcceptPage.tsx`; add the route in `src/App.tsx`.
- Settings UI — a "Connect Stripe" card showing connection status.
- `vercel.json` — rewrites for the new pretty-URL webhook path if used.
- Env: `STRIPE_CONNECT_WEBHOOK_SECRET` (document the required Stripe Dashboard Connect webhook endpoint setup in the PR description).
- **Important**: the existing `api/stripe.ts` webhook handling is for SaaS billing — keep the two secrets/code paths clearly separated with explicit logging per action so a misconfigured secret fails loudly, not as a silent 400.

**Feature switch.** New `invoice_card_payments` (category `sales_job_completion`, min_tier `pro` — matches the tier of `one_tap_invoice`/`invoice_chase`). When off, or when the org hasn't connected Stripe, the invoice email renders exactly as it does today (BSB instructions only, no button).

**Verify.**
- Stripe test mode end-to-end: connect a test Connect account → send an invoice → pay with the `4242...` test card → confirm the webhook fires → invoice flips to `paid`/`paid_via='stripe'` → confirm the invoice-chase sweep stops chasing it (check its filter actually excludes paid invoices).
- Unit tests: webhook fulfilment idempotency (duplicate event delivery), token validation (expired/wrong/already-paid).
- Update `docs/SALES_PIPELINE_WORKFLOW.md` — rewrite stages 8–9 from "manual only" to describe the card flow. Changelog.

**Risks.** Webhook secret mix-ups between the SaaS and Connect webhooks fail silently as 400s — log explicitly per action. Double-payment risk if a customer pays by card after already paying by bank transfer — the idempotent `markInvoicePaid` plus an "already paid" state on the `invoice-pay` action (redirect straight to a "this invoice is already paid" page instead of creating a new session) covers this.

---

## Package 4 — Xero-compatible CSV export + BSB story

**Item 2 · Size S/M**

**Goal.** A date-ranged CSV export of invoices that imports cleanly into Xero as sales invoices, sitting alongside the existing free-text BSB/PayID instructions — a credible, honest answer to "do you sync with Xero?" today, with live sync explicitly deferred.

**Verified current state.** Nothing exists — no export of any kind, no Xero/MYOB code. `orgs.invoice_payment_instructions` already holds free-text BSB/PayID.

**Approach.** Entirely **client-side** — no new serverless function needed (helps the Vercel function budget). New pure `src/lib/accountingExport.ts`:
- Query invoices (with `line_items` and `gst_amount` from Packages 1–2) for a date range.
- Emit **one CSV row per line item**, repeating the invoice number across rows — this is Xero's documented convention for multi-line sales-invoice imports.
- Columns: `ContactName` (customer_name), `EmailAddress`, `InvoiceNumber`, `InvoiceDate` (sent_at), `DueDate` (sent_at + 14 days, matching the existing invoice-chase due policy), `Description` (line label), `Quantity` (always 1), `UnitAmount`, `AccountCode` (org-configurable, default `200`), `TaxType` (`GST on Income` when `orgs.gst_registered`, else `BAS Excluded`).
- Lock **one** amount convention and state it explicitly in the UI help text: `UnitAmount` = the gross line amount, imported using Xero's "Tax Inclusive" import option. Don't try to support both conventions.
- Trigger download via a `Blob` — no server round-trip.
- MYOB support is deferred; only build it if actually requested (same builder function, different column map).

**Migration.** Optional: `ALTER TABLE orgs ADD COLUMN accounting_account_code text DEFAULT '200';`

**Files to touch.**
- New `src/lib/accountingExport.ts` + `tests/accountingExport.test.ts` (CSV escaping, GST math, multi-line row generation from a fixture).
- Export button + date-range picker on the invoices/reporting surface (check what reporting page exists first; if none, add an "Accounting" card to org settings next to the `invoice_payment_instructions` editor) plus the account-code field and Xero import help text.

**Feature switch.** New `accounting_export` (min_tier `basic`) — this is a purchase-unblocker, don't gate it behind a paid tier that excludes the smallest teams.

**Verify.**
- Unit tests: fixture round-trip, escaping, GST math, multi-line rows.
- Manual: import the generated CSV into a Xero demo org (or validate headers/format against Xero's published sales-invoice import template).
- No pipeline doc change needed (this is reporting, not pipeline behaviour). Changelog entry.

---

## Package 5 — Booking confirmation + day-before reminder

**Item 5 · Size S/M**

**Step 0 (blocking — do this first).** Verify that something external actually calls `/api/cron/contact-follow-up` on a schedule (check for a cron-job.org config, a GitHub Actions scheduled workflow, or ask the owner). If nothing is configured, **set one up** before writing any code — this same gap means invoice chase and quote chase may never have fired either, and this package's reminder sweep would be equally dead on arrival.

**Goal.** Booking confirmation already exists — verify and polish it. Add an automatic day-before SMS reminder, which does not exist at all today.

**Verified current state.** `api/_lib/bookingConfirm.ts` sends a confirmation SMS plus (if a customer email exists) a Resend email with a generated `.ics` calendar attachment, fired non-blocking from `src/components/EventModal.tsx` (~L857) right after a booking saves. This part works. There is no day-before reminder anywhere — no template, no sweep, no dedupe field.

**Approach.**
- New `runBookingReminderSweep` in `api/_lib/bookingReminder.ts`, shaped like the existing `runInvoiceChaseSweep`, added into the consolidated cron chain inside `api/send-sms.ts` (~L627–647, alongside `runContactFollowUpCron`, `purgeOldWorkflowRuns`, `runInvoiceChaseSweep`, `runQuoteChaseSweep`).
- Selection: `events` rows where `start_time` falls in `[now()+20h, now()+28h]` AND `reminder_sent_at IS NULL`, joined to a lead that isn't lost/cancelled, org has the switch on. The 8-hour window plus a dedupe flag makes this robust to whatever cadence the external scheduler actually runs at (hourly through 4-hourly all work correctly).
- Dedupe on **`events.reminder_sent_at`**, not on the lead — a lead can have more than one booking.
- Send via the existing `buildSmsFromBrand` helper with a new template key `booking_reminder`, added to `getDefaultSmsTemplates()` and `EDITABLE_SMS_TEMPLATE_KEYS` in `src/lib/brandTemplates.ts` (confirm `src/components/BrandTemplatesEditor.tsx` picks up new keys automatically since it's key-driven).
- Log a new lead-event type for the reminder (add to `api/_lib/leadEventTypes.ts`, `src/lib/leadEventPayload.ts`, `src/lib/formatLeadEvent.ts`).
- **Polish while in this file**: fix the `.ics` `ORGANIZER` field in `bookingConfirm.ts`, currently a hard-coded placeholder `noreply@example.com` — use a real brand/org email.
- Optional, recommended if time allows: add `orgs.timezone text NOT NULL DEFAULT 'Australia/Perth'` (no org timezone column exists anywhere today) and a quiet-hours guard so reminders only send 8am–8pm local time.
- Optional: a `last_cron_run_at` heartbeat somewhere visible, so the external-scheduler dependency has an observable health signal instead of failing silently forever.

**Migration.**
```sql
ALTER TABLE events ADD COLUMN reminder_sent_at timestamptz;
-- optional:
ALTER TABLE orgs ADD COLUMN timezone text NOT NULL DEFAULT 'Australia/Perth';
```
Plus the `feature_flag_catalog` insert for the new switch.

**Files to touch.**
- New `api/_lib/bookingReminder.ts`, with the window/dedupe selection logic extracted into a small pure/testable function.
- `api/send-sms.ts` — add the sweep call to the cron chain.
- `api/_lib/bookingConfirm.ts` — fix the `.ics` organizer placeholder.
- `src/lib/brandTemplates.ts` — new template key.
- `api/_lib/leadEventTypes.ts`, `src/lib/leadEventPayload.ts`, `src/lib/formatLeadEvent.ts` — new event type.
- `shared/featureSwitchCatalog.ts` + migration.

**Feature switch.** New `booking_reminder_sms` (category `customer_communication`, min_tier `basic`).

**Verify.**
- Unit tests on the window/dedupe policy: an event at +19h doesn't send, one at +24h sends exactly once, a second sweep pass doesn't re-send.
- Staging: create a booking for tomorrow, manually invoke the cron action with `CRON_SECRET`, confirm the SMS sends, `reminder_sent_at` is set, and the audit event appears.
- Update `docs/SALES_PIPELINE_WORKFLOW.md` (stage 5 Booking) + version bump. Changelog.

---

## Package 6 — Closed-loop quote→book→invoice→pay→review

**Item 3 · Size M — depends on Packages 3 and 5 being done**

**Goal.** Every hand-off in the pipeline is either fully automatic or exactly one tap — this is the "product promise" the owner is selling. This package is mostly glue plus one genuinely new automation, plus a documentation rewrite.

**The five links, and what each needs:**

1. **Accept → book** (stays human — scheduling needs judgment, but reduce to one tap). `notifyManagersQuoteAccepted` in `api/_lib/quotes.ts` currently just notifies managers "Ready to book." Make it deep-link straight into the calendar with `EventModal` pre-filled from the lead/quote (name, address, quote scope → notes, quote amount → `job_quote`) — e.g. a `/calendar?bookLead=<leadId>` entry point. Verify `src/lib/leadNextAction.ts` `resolveLeadNextAction()` already surfaces `book` as the primary CTA for an accepted-quote lead; fix if not (it has existing tests in `tests/leadNextAction.test.ts` to extend).
2. **Book → confirm/remind** — already solved by the existing `bookingConfirm.ts` plus Package 5's reminder. Nothing new here beyond what those deliver.
3. **Complete → invoice** (make it the default path, not an extra tap). After `CompletionChecklist` finishes, when `one_tap_invoice` is on, auto-advance into `InvoiceStep` rather than requiring a separate manual step to even open it; keep an explicit "skip" that still records `delivery_method='skipped'` as today.
4. **Invoice → pay** — delivered by Package 3, plus the existing chase ladder.
5. **Paid → review (the one genuinely new automation)**. Currently review requests are 100% manual (`src/lib/reviewRequest.ts`, a button tap in the completion flow) and fire on completion, never on payment — the one link nobody remembers to close. Add it server-side inside `markInvoicePaid` in `api/_lib/invoices.ts` (so it fires identically whether the invoice was marked paid by the Package 3 webhook or manually): when a new switch `auto_review_on_paid` is on, AND `review_requests` is on, AND `orgs.google_review_url` is set, AND `leads.review_request_sent_at IS NULL` → send the review SMS. Extract the message-sending logic out of the client-only `src/lib/reviewRequest.ts` into a new server-side `api/_lib/reviewRequest.ts` that reuses `buildSmsFromBrand`; keep the existing manual button working unchanged. Dedupe reuses the existing `leads.review_request_sent_at` column.

**Migration.** Feature-flag catalog insert only (`auto_review_on_paid`, category `customer_communication`, min_tier `basic` — this is a retention hook, don't gate it behind the expensive tier).

**Files to touch.**
- `api/_lib/quotes.ts` (deep-link in the accept notification), the calendar page + `src/components/EventModal.tsx` (prefill-from-lead entry point).
- Completion flow / `src/components/InvoiceStep.tsx` (auto-advance default).
- `api/_lib/invoices.ts` (`markInvoicePaid` triggers the review hook).
- New `api/_lib/reviewRequest.ts` (server-side send, extracted from `src/lib/reviewRequest.ts`).
- `src/lib/leadNextAction.ts` + `tests/leadNextAction.test.ts` if the accepted-quote CTA gap is found.
- `shared/featureSwitchCatalog.ts` + migration.
- `docs/SALES_PIPELINE_WORKFLOW.md`.

**Verify.**
- Full staging end-to-end run of the entire loop: quote → public accept → manager one-tap book (confirmation fires) → manually invoke the reminder cron → complete → invoice auto-advances → pay with a Stripe test card → webhook marks paid → review SMS sends automatically exactly once. This run doubles as the acceptance test for Packages 3 and 5.
- Unit tests on the paid→review guard conditions (switch off, no Google review URL set, already sent).
- Rewrite the end-to-end narrative in `docs/SALES_PIPELINE_WORKFLOW.md` (this is precisely a pipeline-behaviour change — expect at least a minor version bump, possibly major given how much of the customer experience map changes) including a diagram of which hand-offs are automatic vs one-tap. Changelog.

---

## Package 7 — True mobile field day / offline extension

**Item 4 · Size M**

**Goal.** A tech in a signal black spot can take photos (already works), write a note, and complete a job with the checklist — all queued locally — with the invoice firing as soon as signal returns. Nothing should fail silently.

**Verified current state.** The offline architecture is solid and proven for two item types: `src/lib/offlineQueue.ts` (IndexedDB queue) + `src/lib/flushOfflineQueue.ts` (FIFO replay, per-item try/catch that keeps and skips failures rather than blocking the whole queue) + `src/hooks/useOfflineQueue.ts` (auto-flush on the `online` event) + `src/components/OfflineBanner.tsx` (global status banner in `src/App.tsx`) already handle **contact attempts** (call/SMS) and **lead photos** (capped at 10). The gap: job completion (the handler in `src/pages/LeadsPage.tsx` ~L600–609 and `src/components/CompletionChecklist.tsx`) and contact notes (`src/components/LeadContactNote.tsx`) write directly to Supabase with **no** `navigator.onLine` guard — completing a job or saving a note offline fails silently today.

**Approach.**
- Extend `offlineQueue.ts` with two new item types: `'completion'` (leadId, checklist payload, completed_at) and `'lead_note'` (leadId, note text, created_at).
- Introduce a small shared "write-or-enqueue" helper that wraps both call sites: attempt the online write; on `!navigator.onLine` or a network failure, enqueue instead and show the same optimistic "Saved — will sync" UI pattern already used for photos.
- Extend `flushOfflineQueue.ts` with two new replay branches, keeping the existing FIFO + per-item try/catch semantics: for `completion`, **re-read the lead's current status first** and skip-and-log (don't error) if it's already `completed`/`lost` — this is the conflict guard against double-completion if the lead was also completed from another device while offline; for `lead_note`, insert the event with the original captured timestamp in the payload. Mark replayed items `source: 'offline_queue'` as the existing photo/contact-attempt flush already does.
- Explicitly **out of scope for this package** (document as v2, don't attempt): offline quote/invoice creation (invoicing needs the server for email delivery anyway — completing offline and invoicing once signal returns is the correct field story), and a cached-read layer for the lead list (reads stay live).
- Include a quick mobile one-handed usability pass on the completion→invoice flow while in this code.

**Migration.** None — payloads land in existing tables via the existing insert paths.

**Files to touch.**
- `src/lib/offlineQueue.ts`, `src/lib/flushOfflineQueue.ts`, `src/hooks/useOfflineQueue.ts` (new item types).
- `src/components/CompletionChecklist.tsx` and the completion handler in `src/pages/LeadsPage.tsx`.
- `src/components/LeadContactNote.tsx`.
- `src/components/OfflineBanner.tsx` (update queued-item copy if it displays counts by type).
- New `tests/offlineQueueCompletion.test.ts` — replay logic and the conflict-skip logic extracted into pure, testable functions.

**Feature switch.** None — offline resilience is a baseline reliability property, not a tiered feature.

**Verify.**
- Chrome DevTools offline mode: complete a job + add a note + add photos while offline → banner shows queued items → go back online → auto-flush → lead is completed, note and photos present, all events show `source: 'offline_queue'`.
- Conflict case: simulate the lead being completed from another device while the first device was offline → the queued completion is skipped with a log entry, no double-completion event.
- Update `docs/SALES_PIPELINE_WORKFLOW.md` (stage 6 Execution — note the expanded offline behaviour) + version bump. Changelog.

**Risk.** iOS Safari can evict IndexedDB Blobs under storage pressure — this is an existing exposure shared with the photo queue; note it, don't attempt to solve it in this package.

---

## Package 8 — In-app onboarding: pool timer + contact rounds

**Item 8 · Size S**

**Goal.** A new team member understands the pool countdown and contact-round mechanics from inside the app, without needing founder-led training — these are bespoke mechanics that don't exist in any other trade app, so they need explicit teaching.

**Verified current state.** The only onboarding artifact today is a single dismissible coach banner: `src/lib/leadsPoolCoach.ts` (per-user localStorage dismissal) rendered inline in `src/pages/LeadsPage.tsx` (~L1074–1092), team-mode only. There's no tour library and no first-run flow of any kind. `src/lib/leadNextAction.ts` `resolveLeadNextAction()` is a pure CTA resolver (not onboarding, but a natural anchor point). `src/components/CountdownTimer.tsx` already has pool-hint copy.

**Approach.** Generalize the proven coach-banner pattern rather than introducing a tour library (a modal tour is brittle against mobile anchor positions and adds bundle weight for one small feature). New `src/lib/onboardingTips.ts`: an ordered list of tip definitions (`id`, anchor context, title, body, `showWhen` predicate), per-user progress in localStorage (`onboarding_tips_v1:<userId>`, following the same keying convention as `leadsPoolCoach.ts`), and a pure `resolveNextTip(state, context)` function with its own tests. One tip visible at a time; "Got it" advances to the next; a small "?" affordance in the header replays from the start.

Tips (v1, team mode only — solo mode has no pool):
1. **Pool timer** — anchored at `CountdownTimer`, shown the first time a pooled lead is visible: what the countdown means, what happens at zero (auto-return to pool per the existing `expire_overdue_leads` / contact-follow-up rules).
2. **Contact rounds** — shown the first time a lead is `contact_attempted`: the rounds ladder and the auto-lost rule.
3. **Next-action CTA** — a one-time callout over the `resolveLeadNextAction` button explaining "this button always shows your next move."

Migrate the existing pool-coach banner into this system as tip 1 rather than running both side by side (avoids double-teaching the same concept in two different UI patterns). Cross-device persistence (a `profiles` column instead of localStorage) is a documented v2, not part of this package.

**Migration.** None (localStorage-only in v1).

**Files to touch.**
- New `src/lib/onboardingTips.ts` + `tests/onboardingTips.test.ts`.
- New `src/components/OnboardingTip.tsx`, styled consistently with the existing coach banner.
- `src/pages/LeadsPage.tsx` (render points, replacing the current coach-banner render block).
- `src/components/CountdownTimer.tsx` (anchor point, reconcile with its existing pool-hint copy so it isn't duplicated).
- `src/lib/leadsPoolCoach.ts` (migrate its logic in, then remove the standalone module).

**Feature switch.** Optional but recommended: `onboarding_tips` (category `team_operations`, min_tier `basic`) for brand-level opt-out — cheap to add, keep it.

**Verify.**
- Unit tests: tip sequencing, `showWhen` predicates, localStorage persistence.
- Manual: fresh localStorage → tips appear in order, dismissing one persists across reload, replay via the "?" affordance works, tips never render in solo mode.
- No pipeline doc change needed. Changelog.

---

## Risk register

- **Vercel function limit (hard constraint).** Every package above adds zero new files under `api/` root; Package 3 is the only one adding new *actions* to an existing hub (`api/stripe.ts`). Keep the 12th slot free for as long as possible.
- **External cron scheduler is unverified.** Confirmed nowhere in this repo. Package 5 Step 0 must verify it before building anything sweep-dependent — this affects invoice chase and quote chase too, which may already be silently dead.
- **`paid_via` CHECK constraint** (`supabase/migrations/20250704120000_invoices.sql` L27) has an auto-generated name — look it up before the drop/recreate in Package 3.
- **RLS on new tables** (`price_list_items` in Package 2) must copy the invoices policy pattern exactly. Public token pages (invoice pay in Package 3) must go through server actions only, mirroring `QuoteAcceptPage`, never direct client Supabase queries.
- **Offline replay idempotency** (Package 7) hinges on re-checking lead status before replaying a completion — get this right or double-completion events are possible.
- **Two distinct Stripe webhook signing secrets** (SaaS billing vs Connect, Package 3) — a mixup fails silently as a 400; log explicitly per action so it's diagnosable.
- **Documentation discipline.** `docs/SALES_PIPELINE_WORKFLOW.md` needs a version bump in Packages 1, 2, 3, 5, 6, and 7 — this is a hard repo convention (see that doc's own maintenance policy), not optional polish.
