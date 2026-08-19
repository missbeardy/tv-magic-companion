---
id: "dd11-monthly-recovered-revenue-digest-2026-08-06"
status: "backlog"
priority: "high"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-19T17:15:00.000Z"
completedAt: null
labels: ["due-diligence", "retention", "customer-communication"]
order: "Z9"
---

# DD11 Monthly recovered revenue digest

**The retention problem is structural, not cosmetic.** SaaS retention needs a daily habit. This product's value is *reactive* — it matters when a lead arrives. A quiet week means the tradie sees a $69 charge against zero visible recoveries and cancels.

Worse: the **front-door add-on position deliberately hands the daily habit to the incumbent** (ServiceM8 is where they look at today's jobs) and keeps the intermittent half. That is the hidden cost of the T2.9 positioning decision and it is not written down in BUSINESS.md.

BUSINESS.md already spots the fix and files it as a "future retention hook." The review's finding: **it is not a nice-to-have, it is the product's only structural defence against silent churn.** Promote it.

## Spec

- Monthly per-org email (and in-app card): leads captured, response time vs target, jobs booked that originated from a missed call / inbound channel, invoices paid, total value of recovered work.
- The headline number is **recovered revenue** — jobs that reached `booked` from an inbound/missed-call origin × their invoice value. This is the number the entire pitch rests on and it is already derivable from `lead_events` + `invoices`.
- Reuse the existing `monthly_org_reports` snapshot job rather than building a new aggregation.
- Send via Resend using the existing branded transactional email path.
- Honest when the number is low — a bad month reported honestly builds more trust than silence, and it is the prompt for a check-in call.

**Feature switch:** new per-brand `monthly_value_digest` (category `customer_communication`, default off, min_tier basic), gating the **server** send, not just the UI. Confirm the category at build.

**Depends on `dd1`:** without analytics you cannot verify the digest's numbers are right, and the "did it reduce churn?" question is unanswerable.

## Done when

- [ ] An org receives a monthly digest with an accurate recovered-revenue figure that reconciles against `lead_events` / `invoices` by hand.
- [ ] Switch off means no send (server-side, not just UI).

**Difficulty:** Medium.

Source: DUE_DILIGENCE_REVIEW.md — Phase 1 (#4), Phase 7 retention, Phase 8 item 15.


---

## Verified against the code 19-08-2026

**The card's central assumption is wrong.** It says "reuse the existing `monthly_org_reports` snapshot job rather than building a new aggregation". Two problems:

1. `public.snapshot_monthly_reporting()` exists as a `SECURITY DEFINER` function but **has no caller anywhere in the repo** — no workflow, no `vercel.json` rewrite, no `cronActions` handler. Scheduling it is part of this card, not a precondition already met.
2. `monthly_org_reports` has **no revenue column**. It carries funnel counts, rates, timings and `source_breakdown jsonb`. Recovered revenue needs a new column and new SQL inside that function.

Also unresolved: `leads` has **two** origin columns with different value sets and no CHECK constraint — `lead_source` (AI-extracted, prompt-constrained) and `source` (ingestion path; `processVoicemail.ts` writes both `'phone'` and `'voicemail_email'`). Which one defines "inbound origin" must be decided before the aggregation is written, or the headline number is quietly wrong.

Real scope is roughly 2x the card. Zero new Vercel functions needed — follow the existing workflow -> rewrite -> `cronActions` pattern.
