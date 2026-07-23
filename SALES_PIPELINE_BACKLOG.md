# Sales Pipeline Backlog

**Workflow reference (keep updated):** [docs/SALES_PIPELINE_WORKFLOW.md](docs/SALES_PIPELINE_WORKFLOW.md) — versioned map of customer, user, and API behaviour. Update in the same PR as any pipeline change.

**Goal:** Stages 1–10 → Completed (fully automatable end-to-end)  
**Governing build order:** [ROADMAP.md](ROADMAP.md) (this backlog is a detailed checklist; ROADMAP wins on priority)  
**Now:** Stage 3.1 — Enable acks for TV Magic (T1.10, deferred pending manager approval)  
**Last shipped:** T2.1 closed-loop (20-07-2026) + Must-Have packages 1–6

## Progress

| Stage | Status |
|-------|--------|
| 1 Capture | Done |
| 2 Extraction | Done |
| 3 Acknowledgment | Built dark — enable pending manager approval (T1.10) |
| 4 Quoting | Done (e-sign + SMS link + price list) |
| 5 Booking | Done (confirm + day-before reminder + accept→book deep-link) |
| 6 Job execution | Done (photos on active jobs, offline complete) |
| 7 Invoicing | Done (one-tap + GST Tax Invoice) |
| 8 Payment | Done (Stripe Connect Pay Now) |
| 9 Reconciliation | Done (webhook mark paid) |
| 10 Review | Done (manual + auto on paid via `auto_review_on_paid`) |

---

## Now

- [ ] **3.1** Enable `lead_ack_sms` + `manager_new_lead_alerts` for TV Magic (manager approval — T1.10)

---

## Stages (reconciled 20-07-2026)

### Stage 1 — Capture

- [x] 1.1–1.7 Capture channels live

### Stage 2 — Extraction

- [x] 2.1–2.5 Extraction + fallback + retry

### Stage 3 — Acknowledgment

- [ ] 3.1 Enable switches for TV Magic prod
- [x] 3.2 Ack SMS on inbound paths (built)
- [x] 3.3 `notifyManagersNewLead` after insert
- [x] 3.4 OneSignal push on new lead
- [x] 3.5 Customer email ack (`lead_ack_email`)
- [x] 3.6 Ack copy / SLA in brand templates
- [ ] 3.7 **UAT:** SMS in → customer ack + manager push &lt;60s (blocked on 3.1)

### Stage 4 — Quoting

- [x] 4.1–4.7 Quote e-sign, SMS link, decline, accept notify, Book CTA / deep-link

### Stage 5 — Booking

- [x] 5.1–5.6 Prefill from quote, confirm SMS/email/.ics, tech notify, solo auto-assign

### Stage 6 — Job execution

- [x] 6.1 Photos on assigned/booked
- [x] 6.2–6.5 Completion checklist path (offline-capable)

### Stage 7 — Invoicing

- [x] 7.1–7.6 One-tap invoice, line items from quote, Tax Invoice

### Stage 8–9 — Payment / Reconciliation

- [x] 8.1–9.4 Stripe Connect Pay Now + webhook mark paid + manual mark-paid

### Stage 10 — Review

- [x] 10.1–10.5 Manual review SMS + auto on paid (`auto_review_on_paid`) with `review_request_sent_at` dedupe

---

## Parking lot

- Platform Admin UI for `org_phone_numbers` — deferred
- Xero/MYOB **two-way** pull + payment reconciliation — beyond T3.1 push
- Messenger hybrid bot — Tier 3
- MYOB CSV variant — T3.9

---

## Shipped log

| Date | Task | Notes |
|------|------|-------|
| 30-06-2026 | 1.1 Raw-first insert | email/SMS/VM hardened |
| 30-06-2026 | 1.2 Inbound switches | migration `20250701150000_fieldbourne_inbound_enable.sql` |
| 13-07-2026 | Stage 1–2 | Capture + extraction live |
| 15-07-2026 | Packages 1–4 | GST, price list, Pay Now, Xero CSV |
| 16-07-2026 | Package 5 | Booking reminder |
| 20-07-2026 | Package 6 / T2.1 | Closed-loop + auto review on paid |
