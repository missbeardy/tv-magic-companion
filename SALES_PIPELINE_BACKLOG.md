# Sales Pipeline Backlog

**Workflow reference (keep updated):** [docs/SALES_PIPELINE_WORKFLOW.md](docs/SALES_PIPELINE_WORKFLOW.md) — versioned map of customer, user, and API behaviour. Update in the same PR as any pipeline change.

**Goal:** Stages 1–10 → Completed (fully automatable end-to-end)  
**Preview:** `https://tv-magic-companion-git-feature-plat-8c5410-missbeardys-projects.vercel.app`  
**FieldBourne org:** _(set your org id in Supabase)_  
**Now:** Stage 1, task 1.3 — verify org routing (plus-tag + DID)  
**Last shipped:** 1.1 raw-first + 1.2 FieldBourne inbound switches (30-06-2026)

## Progress

| Stage | Status |
|-------|--------|
| 1 Capture | In progress |
| 2 Extraction | — |
| 3 Acknowledgment | — |
| 4 Quoting | — |
| 5 Booking | — |
| 6 Job execution | — |
| 7 Invoicing | — |
| 8 Payment | — |
| 9 Reconciliation | — |
| 10 Review | — |

---

## Now

- [x] **1.3** Verify org routing: plus-tag + DID — `DEFAULT_ORG_ID` fallback removed; unmapped inbound → `unrouted_inbound` + alert

---

## Next (stages 1→10, in order)

### Stage 1 — Capture

- [x] 1.1 Raw-first insert on all webhooks (email, SMS, voicemail paths)
- [x] 1.2 Enable inbound switches for FieldBourne (`inbound_sms`, `inbound_email`, `inbound_calls`)
- [x] 1.3 Verify org routing: plus-tag + DID — `DEFAULT_ORG_ID` fallback removed; unmapped inbound → `unrouted_inbound` + alert
- [ ] 1.4 Platform Admin UI for `org_phone_numbers`
- [ ] 1.5 `POST /api/inbound-web-form`
- [ ] 1.6 Facebook Messenger lead insert (`metaWebhook.ts`)
- [ ] 1.7 **UAT:** SMS, email, missed call, web form → lead &lt;5s, correct org

### Stage 2 — Extraction

- [ ] 2.1 Centralize → `api/_lib/extractLead.ts`
- [ ] 2.2 Email + SMS fallback parser if Claude fails — **email done in 1.1**
- [ ] 2.3 Enrich missed-call leads when transcript available
- [ ] 2.4 `extraction_status` + manager retry in lead detail
- [ ] 2.5 **UAT:** Break Claude key → lead still saved

### Stage 3 — Acknowledgment

- [ ] 3.1 Enable `lead_ack_sms` + `manager_new_lead_alerts` for FieldBourne
- [ ] 3.2 Ack SMS on all inbound paths
- [ ] 3.3 Fix `inbound-sms.ts`: `notifyManagersNewLead` after insert — **done in 1.1 ship**
- [ ] 3.4 OneSignal push on new lead
- [ ] 3.5 Customer email ack for inbound email
- [ ] 3.6 Ack copy: callback window / SLA in brand templates
- [ ] 3.7 **UAT:** SMS in → customer ack + Nick push &lt;60s

### Stage 4 — Quoting

- [ ] 4.1 Enable `quote_esign` for FieldBourne
- [ ] 4.2 AI quote draft in `QuoteComposerModal`
- [ ] 4.3 SMS quote link to customer
- [ ] 4.4 Customer decline on public quote page
- [ ] 4.5 On accept: events, manager notification, status `quote_accepted`
- [ ] 4.6 On accept: open book flow with quote amount prefilled
- [ ] 4.7 **UAT:** Lead → AI quote → customer signs → Nick notified

### Stage 5 — Booking

- [ ] 5.1 `EventModal` prefills from lead + accepted quote
- [ ] 5.2 Customer booking confirmation SMS
- [ ] 5.3 Customer email + `.ics`
- [ ] 5.4 Tech OneSignal + SMS on every booking
- [ ] 5.5 Solo mode: auto-assign on book if unassigned
- [ ] 5.6 **UAT:** Accept → book → customer SMS + tech push

### Stage 6 — Job execution

- [ ] 6.1 Photos on `assigned`/`booked` leads
- [ ] 6.2 Freeform job notes at completion → `lead_events`
- [ ] 6.3 Unify completion — no kanban drag bypass
- [ ] 6.4 Optional checklist from quote `scope`
- [ ] 6.5 **UAT:** Photo on-site → complete on phone

### Stage 7 — Invoicing

- [ ] 7.1 Enable `one_tap_invoice` for FieldBourne
- [ ] 7.2 Auto-send when quote + email exist
- [ ] 7.3 Quote `scope` → `line_items`
- [ ] 7.4 Server-generated PDF in email
- [ ] 7.5 Invoices list in Org Settings
- [ ] 7.6 **UAT:** Complete → invoice + PDF

### Stage 8 — Payment

- [ ] 8.1 Spike: Stripe Connect vs Payment Link to Nick's account
- [ ] 8.2 Migration: payment fields on `invoices`
- [ ] 8.3 `invoiceStripe.ts` + `stripe-invoice-webhook.ts`
- [ ] 8.4 Pay Now in invoice email
- [ ] 8.5 **UAT:** Test payment succeeds

### Stage 9 — Reconciliation

- [ ] 9.1 Webhook → `markInvoicePaid`
- [ ] 9.2 Lead card + reports update realtime
- [ ] 9.3 Manual mark-paid for cash/bank only
- [ ] 9.4 **UAT:** Pay in test mode → paid without Nick clicking

### Stage 10 — Review

- [ ] 10.1 Enable `review_requests` + Google Review URL
- [ ] 10.2 Auto-send on complete (org setting to disable)
- [ ] 10.3 Never send twice
- [ ] 10.4 All paths use same logic
- [ ] 10.5 **UAT:** Complete → review SMS &lt;60s

### Full pipeline UAT (after Stage 10)

1. SMS enquiry → lead + ack + Nick push
2. AI quote → customer e-signs → book prompt
3. Book → customer confirm + tech notify
4. On-site photo → complete → invoice + PDF
5. Customer pays link → auto-paid
6. Review SMS auto-sent

---

## Parking lot

- Xero/MYOB sync
- Messenger hybrid bot
- Theme polish beyond nav

---

## Shipped log

| Date | Task | Notes |
|------|------|-------|
| 30-06-2026 | 1.1 Raw-first insert | email/SMS/VM hardened; WhatsApp changes excluded |
| 30-06-2026 | 1.2 Inbound switches | migration `20250630140000_fieldbourne_inbound_enable.sql` |

---

## UAT scripts

### Stage 1.1 — Raw-first insert

1. Send test email to FieldBourne CloudMailin address with invalid/missing Anthropic key temporarily, OR send normal email and confirm lead appears before extraction finishes.
2. Text Twilio number — lead saved even if Claude slow.
3. Confirm `raw_email` / `raw_sms` populated on lead row in Supabase.
