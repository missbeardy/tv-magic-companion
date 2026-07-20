# FieldBourne — 60-second demo runbook (T2.2)

| Field | Value |
|-------|-------|
| **Purpose** | Run the sales demo cold, twice in a row, from a phone |
| **Depends on** | T2.1 closed-loop; wedge switches ON; dedicated Twilio DID |
| **Beat sheet** | [MARKETING.md](MARKETING.md) § “The 60-second demo” |

## One-time setup (dev or dedicated demo brand)

1. **Org** — Platform Admin → Provision franchisee under FieldBourne (or a Demo brand). Tick **solo tradie wedge preset**. Mode: **solo**.
2. **Twilio** — Buy/reserve a demo AU number. SMS webhook → `POST https://<prod-or-preview>/api/inbound-sms`. Map DID → org in `org_phone_numbers`.
3. **Missed-call path** — Point voicemail-to-email (or CloudMailin) at the org’s plus-tag so hang-ups create leads + hookback SMS.
4. **Price list** — Franchise Settings → add 3–5 chips including an emergency call-out (~$220).
5. **Google review URL** — set if you will demo paid→review.
6. **Stripe Connect** — optional for Pay Now beat; skip for the 60s enquiry→booked pitch.
7. **Phone** — Install the PWA as FieldBourne, log in as the demo manager, allow notifications.

## Reset between demos

Run against the **demo org id** only (never prod TV Magic):

```bash
# Set DEMO_ORG_ID then:
psql "$DATABASE_URL" -f scripts/demo-reset.sql
```

Or paste `scripts/demo-reset.sql` into Supabase SQL Editor after replacing `:demo_org_id`.

Clears: leads (soft + hard demo rows), lead_events, events, quotes, invoices for that org. Keeps: users, brand, switches, price list, customers (optional — uncomment customer wipe in the script if you want a clean slate).

## Beat sheet (rehearse until cold)

| Time | Action | Pass criteria |
|------|--------|----------------|
| 0:00 | Ring demo DID from presenter’s phone; hang up | Hookback SMS arrives <15s |
| 0:10 | Reply with job + address | Lead card appears on tradie Android <10s with countdown |
| 0:40 | Tap price-list chip → send quote → Accept on presenter phone | Manager notify + Book deep-link works |
| 0:50 | Book tomorrow morning | Presenter gets confirm SMS + .ics |

Run **twice** without fixing anything mid-demo. If anything stumbles, fix then re-run both passes.

## Known gates

- Stage-3 ack SMS for **TV Magic prod** still needs manager approval (T1.10). Demo org should have `lead_ack_sms` / `missed_call_hookback_sms` ON via the preset.
- Cron (booking reminder, chase) hits **prod** — not required for the 60s pitch.
