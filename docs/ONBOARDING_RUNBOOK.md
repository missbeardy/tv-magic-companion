# FieldBourne — New Customer Onboarding Runbook (draft)

| Field | Value |
|-------|-------|
| **Purpose** | Founder-led steps to stand a new paying business up to demo-quality in one sitting |
| **Status** | Current — T2.6 solo-tradie preset shipped; self-serve signup still Tier 3 |
| **Time budget** | ~60–90 min including comms plumbing; ~15 min for the in-app part once practised |

## Before the session (owner, ~30 min)

1. **Comms plumbing** (the only genuinely fiddly part):
   - Buy an AU **Twilio number** for the org; point its SMS webhook at `POST /api/inbound-sms` on prod. Map number → org in the **`org_phone_numbers`** table (no admin UI yet — deliberate; do it in SQL via the Management-API flow).
   - **CloudMailin inbound email**: give the org its plus-tag address (routing via `resolveOrgFromInboundEmail`); if they want voicemail/missed-call capture, point their phone system's voicemail-to-email at it.
   - Unmapped inbound doesn't vanish — it lands in `unrouted_inbound` with an alert — but map first anyway.
2. **Stripe**: nothing to pre-create for job payments (Connect onboarding is done by the customer in-session below). For *their subscription*, decide manual tier vs Stripe checkout.
3. Confirm prod Supabase backup/PITR is on (see BUSINESS.md risks) — non-negotiable from customer #2.

## In the session (with the tradie, ~45 min)

### 1. Provision (Platform Admin, `/platform`)
- Create the org under the right **brand** (or create a brand first if this is a new look), set **tier**, set **operation_mode = solo** (or team).
- Tick **Apply solo tradie wedge preset** on create (turns on inbound, ack, quotes, booking, invoice, review, price list, import, tips on the brand). Or apply later via Platform feature switches.
- **Brand templates** (Platform Admin → template editor): walk every SMS/email template with them — ack copy + callback SLA, booking confirm, day-before reminder, chase ladders, review request. This copy *is* their customer experience; don't ship defaults unread.

### 2. Business settings (Franchise Settings, as the customer)
- **ABN + GST-registered** flag (drives Tax Invoice vs plain Invoice — ask, don't assume; sub-$75k solos are often not registered).
- **Invoice payment instructions** (BSB/PayID free text) + invoice template look-over.
- **Price list**: enter their 10–20 common jobs with prices — this is also the moment you learn their business. Quote/invoice chips depend on it.
- **Stripe Connect** ("Connect Stripe" card): they do Stripe-hosted onboarding on their own account → invoice emails gain Pay Now. (Server-side gate follows the `invoice_card_payments` switch.)
- **Google review URL** for review-request SMS.
- Logo/colours if they care (brand layer supports it).

### 3. People & devices
- Create their user(s) (manager role for the owner; employees via the create-user flow → set-password email).
- On **their phone**: install the PWA (Add to Home Screen), log in, **accept notification permission** (OneSignal), make a test call to check the dialer flow.

### 4. Prove it end-to-end (10 min, do not skip)
Run the pipeline once with their real number before you leave:
1. Text their Twilio number from your phone → lead appears <5s, **ack SMS** received, their phone gets the manager alert.
2. Ring and hang up (if missed-call path configured) → hookback SMS.
3. Tap the lead → call → quote via price-list chip → you e-sign on your phone → book it → you receive the confirmation SMS + `.ics`.
4. Complete the job → invoice email arrives (Tax Invoice correctness: ABN/GST) → Pay Now if Connect was set up → review-request SMS.
5. Check Platform Admin → Workflow Runs shows the runs green.

### 5. Teach the two bespoke mechanics
- Team mode: in-app tips (T2.4) cover pool timer, contact rounds, and next-action CTA — still walk them once live.
- Show the **offline story honestly**: what queues (calls, SMS, photos, completions, notes), what needs signal (sending quotes/invoices).
- Optional: Franchise Settings → **Customer CSV import** if they have an existing list.

## After the session
- [ ] Add them to your support channel expectation (in-app support messaging reaches you).
- [ ] Diarise a day-2 check: `cron_heartbeats` green, their switches behave, first real leads flowing.
- [ ] Log corrections to this runbook while fresh.
- [ ] (Founding customers) book the review/testimonial ask for ~week 3.
