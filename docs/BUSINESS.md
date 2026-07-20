# FieldBourne — Business Notes

| Field | Value |
|-------|-------|
| **Purpose** | The commercial side: model, cost base, pricing inputs, metrics, sales assets, risk register |
| **Status** | Working notes — **T2.9 decided 20-07-2026:** front-door add-on; target solo **$69/mo AUD GST-inc** messaging-included (fair-use SMS); founding discounts OK for reviews |
| **Related** | [MARKETING.md](MARKETING.md) · [ONBOARDING_RUNBOOK.md](ONBOARDING_RUNBOOK.md) · [ROADMAP.md](../ROADMAP.md) |

## Business model

SaaS subscription per business (org), tiers **basic / pro / enterprise** already wired end-to-end: Stripe Checkout + customer portal + webhook sync to `orgs.subscription_tier`, feature switches tier-gated, manual override in Platform Admin. Job payments flow through each tradie's **own** Stripe account (Connect Standard, direct charges) — the platform never holds client money, owns no disputes, and takes no payment-processing risk. An optional platform application-fee on Connect charges is a possible future revenue line (not built; note it, don't build it speculatively).

Second track (later): **white-label / franchise networks.** The brands→orgs layer, per-brand switches and template editors already exist — this is a genuine structural asset most competitors lack. Park until the solo motion works.

## Cost base (verify current prices before relying on them)

Per-org variable costs are dominated by SMS. Approximate AUD figures as of knowledge — **recheck each**:

- **Twilio SMS (AU):** ~5–8¢/segment outbound + ~$6–12/mo per dedicated number. A busy solo tradie doing ~150 automated SMS/mo ≈ $10–15/mo + number. This is the main COGS line and why "all messaging included" is a packaging weapon vs Tradify's 20¢/msg.
- **Anthropic (extraction/captions):** small per-lead cost (short prompts); tens of cents to a few dollars per org/month at solo volume.
- **Resend, OneSignal:** free tiers cover early volume.
- **Supabase:** free tier now; Pro (~US$25/mo) advisable before scaling paying customers (backups/PITR matter — see risks).
- **Vercel:** currently Hobby. **Two problems at scale: (1) Hobby prohibits commercial use — moving to Pro (~US$20/seat/mo) is a compliance matter, not just capacity; (2) Pro also lifts the 12-function cap** that currently constrains the API architecture. Budget this as a launch cost.
- **Stripe:** SaaS billing fees on subscriptions (~1.7% + 30¢ AU domestic); Connect job payments cost the *tradie*, not the platform.

**Rough floor:** platform fixed costs ≈ US$45–50/mo (Vercel Pro + Supabase Pro) + ~AU$15–25/org/mo variable. Anything ≥ AU$49/org/mo is comfortably margin-positive per seat.

## Pricing inputs for T2.9 (decision not made — these are the constraints)

- **Anchors:** ServiceM8 $29 AUD GST-inc unlimited users (free tier exists); Tradify $48–62/user ex-GST. You cannot win a price war; don't enter one.
- **Value frame:** one recovered job = $300–$1,500. "One saved job pays for a year" holds at $49–$99/mo; it weakens above that for solos.
- **Decided (T2.9, 20-07-2026):** Position as a **front-door add-on** (not a ServiceM8 replacement). Solo target **$69/mo AUD GST-inc**, all messaging included with a fair-use SMS clause (Twilio cost sits with the platform). Team = higher **flat per-org** tier (not per-user). Founding customers may be discounted in exchange for reviews/testimonials. Xero live sync stays Tier 3.
- **Suggested shape (superseded by decision above):** single flat solo price in the $59–79/mo range GST-inc…
- Whatever is chosen: record it in ROADMAP.md T2.9 and align `FEATURE_SWITCH_MIN_TIERS` so the sellable wedge (inbound channels, ack, quote e-sign, one-tap invoice, chases, Pay Now) is actually in the tier you sell.

## Metrics that matter (most are already in the data model)

- **Speed-to-lead:** enquiry → ack SMS (<60s target) and enquiry → first human contact (`lead_events` timestamps).
- **Recovery rate:** missed-call/inbound leads that reach `booked` — this is the number the whole pitch rests on; per-org it powers a "we saved you $X this month" email (future retention hook).
- **Pipeline conversion:** quote-sent → accepted; booked → completed; completed → paid (and days-to-paid, before/after chase ladder).
- **Reviews sent/landed** per completed job.
- **SaaS health:** MRR, churn, org weekly-active technicians, feature-switch adoption. **Churn early-warning:** falling lead volume or techs stopping completions in-app.
- Platform ops: `cron_heartbeats` continuity, extraction fallback rate, offline-queue flush failures.

## Sales assets checklist

- [ ] 60-second demo video (after T2.2) — hero asset everywhere.
- [ ] **Nick / TV Magic South Brisbane case study** — the single highest-value asset available right now: months of daily production use, real numbers (leads captured, response time, invoices paid). Ask permission, pull the stats from `lead_events`/reports, one page + 3 pull-quotes.
- [ ] Missed-call cost calculator (jobs/week × close rate × avg job) as lead magnet.
- [ ] One-page honest comparison vs ServiceM8/Tradify (front-door framing, from MARKETING.md — including what they do better).
- [ ] Founding-customer offer terms (discount ↔ review + testimonial + feedback calls).

## Risk register (business-level)

| Risk | Note / mitigation |
|---|---|
| **Single developer + AI-assisted codebase** | Bus factor 1. Mitigations that exist: strong test suite, ROADMAP governance, docs. Keep them current — they *are* the continuity plan. |
| **Vercel Hobby commercial-use terms** | Move to Pro before charging strangers (also solves the 12-function cap). |
| **Prod DB not migration-driven** (T2.7) | Every new customer raises the blast radius of ad-hoc schema ops. Reconcile before scaling; ensure Supabase backups/PITR are on **before** customer #2. |
| **Key-person client concentration** | One paying client = 100% of revenue and the only case study. Tier 1 (their field reliability) is revenue defence, not polish. |
| **Platform dependencies** | Twilio AU sender-ID/compliance rules, Meta webhook review, Apple PWA-push quirks — none blocking today; recheck at launch. |
| **Incumbent response** | ServiceM8/Tradify could ship missed-call-text-back. The moat is the *worked pipeline* (timers, rounds, chases) + AU SMS economics, not any single feature — keep selling the discipline engine. |
| **Support load at scale** | In-app support messaging exists but is founder-answered. Fine to 10–20 orgs; revisit after. |

## Legal/compliance to sort before charging strangers (not legal advice — get proper advice)

- Terms of Service + Privacy Policy (customer PII: names, phones, addresses, job photos; Australian Privacy Principles apply). Data-processing story for Supabase/US-hosted subprocessors.
- SMS compliance: consent/opt-out line on automated customer SMS (ack/reminder/chase), Spam Act 2003 posture.
- Your own ABN/GST registration + the app's SaaS invoices to customers (the app already handles *their* invoices; yours come from Stripe billing).
- PWA/OneSignal notification permissions copy; photo-storage retention statement.
