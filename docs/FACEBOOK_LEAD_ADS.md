# Facebook Lead Ads → FieldBourne leads (via Make.com)

Capture leads from **Facebook Lead Ads instant forms** the moment the customer submits,
so technicians work them from the app instead of Meta Leads Center.

## Flow

```
Customer → Lead Ads instant form → Make.com (instant trigger) → POST /api/inbound-facebook-lead → Unassigned lead
```

Uses the same endpoint as the Messenger path ([BOTPRESS_FACEBOOK_LEAD.md](BOTPRESS_FACEBOOK_LEAD.md)),
distinguished by `channel: "lead_ads"`. The two channels have **separate feature switches**, so a
franchise can run ads without the Messenger bot.

## Why Make and not Zapier

Make's HTTP module is available on the **free** plan (1,000 operations/month — a lead is 2 ops, so
roughly 500 leads/month), and its Facebook Lead Ads trigger is instant rather than polled.
Zapier's equivalent "Webhooks by Zapier" action is a **premium** app, so the same two-step
automation forces a paid plan. Confirm current plan limits at setup — vendor pricing moves.

## API

| | |
|--|--|
| **URL** | `POST https://<your-vercel-domain>/api/inbound-facebook-lead` |
| **Auth** | Header `x-inbound-secret: <INBOUND_SECRET>` (Vercel env) |
| **Content-Type** | `application/json` |

### Request body

| Field | Required | Description |
|-------|----------|-------------|
| `channel` | **Yes for ads** | `"lead_ads"`. Omitted or `"messenger"` routes to the Messenger path and the wrong feature switch. |
| `org` | Yes | Franchise `orgs.slug` (e.g. `fieldbourne`) |
| `name` | Yes | Customer name (`full_name` on most forms) |
| `phone` | Yes | AU phone, normalised to E.164 server-side |
| `form_name` | No | The ad form's name. Instant forms often collect nothing but name/phone, so this is usually the only clue about what the customer responded to — **map it.** It feeds both the lead details and AI service-type extraction. |
| `city` | No | Suburb/postcode question, if the form has one |
| `message` | No | Free-text question, if the form has one |
| `email` | No | If the form collects it |
| `website` | No | **Honeypot** — must be empty or the request is rejected |

### Example JSON

```json
{
  "channel": "lead_ads",
  "org": "fieldbourne",
  "name": "{{full_name}}",
  "phone": "{{phone_number}}",
  "email": "{{email}}",
  "city": "{{city}}",
  "form_name": "{{form.name}}",
  "message": "",
  "website": ""
}
```

## Make.com scenario

1. **Trigger** — *Facebook Lead Ads → Watch Leads*. Connect the client's Facebook account
   (must be a **Page admin** with Leads Access) and select the Page + form.
   Meta's own permission review covers this connection; no app review on our side.
2. **Action** — *HTTP → Make a request*.
   - Method `POST`, URL as above
   - Headers: `Content-Type: application/json`, `x-inbound-secret: <INBOUND_SECRET>`
   - Body type: Raw / JSON, mapping the trigger's field answers into the JSON above
3. Turn the scenario **ON** (instant triggers only fire while scheduling is on).

Repeat per form, or add a router if one scenario serves several forms. `org` is hardcoded per
scenario to the franchise slug.

### Responses

| Status | Body | Meaning |
|--------|------|---------|
| `200` | `{ "success": true, "lead_id": "uuid" }` | Lead created |
| `200` | `{ "skipped": true, "reason": "unknown_org" }` | Bad `org` slug — captured in `unrouted_inbound` |
| `200` | `{ "skipped": true, "reason": "inbound_facebook_ads_disabled" }` | Feature switch off |
| `400` | `{ "error": "channel must be \"messenger\" or \"lead_ads\"" }` | Bad channel value |
| `400` | `{ "error": "..." }` | Validation / honeypot |
| `401` | `{ "error": "Unauthorized" }` | Wrong or missing secret |

The `skipped` responses are `200` on purpose — Make must not retry them.

## Prerequisites (app)

1. **`INBOUND_SECRET`** set on the Vercel environment Make calls.
2. Migration `20260731120000_inbound_facebook_ads.sql` applied.
3. **Platform → Feature switches** — enable **Facebook Lead Ads** for the client's brand.
4. For instant ack SMS / manager alerts, the Stage-3 switches (`lead_ack_sms`,
   `manager_new_lead_alerts`) must also be on — see ROADMAP T1.10.

## Test with curl

```bash
curl -s -X POST "https://<domain>/api/inbound-facebook-lead" \
  -H "Content-Type: application/json" \
  -H "x-inbound-secret: YOUR_INBOUND_SECRET" \
  -d '{
    "channel": "lead_ads",
    "org": "fieldbourne",
    "name": "Test User",
    "phone": "0412345678",
    "form_name": "TV Aerial Repairs",
    "city": "Brisbane",
    "website": ""
  }'
```

## Lead fields

- `source`: `facebook_lead_ads`
- `lead_source`: `Facebook Lead Ads`
- Status: `unassigned` (team) or `assigned` (solo inbound assignment)

Reporting normalises on `lead_source`, so ad leads stay separable from Messenger leads and from
each other's channels — this is what makes ad spend measurable.

## Backfill

Webhooks are forward-only: leads already sitting in Meta Leads Center will **not** appear.
Add those by hand via **Add Lead** in the app. There is no bulk lead importer.
