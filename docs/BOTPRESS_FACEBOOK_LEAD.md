# Facebook Messenger lead via Botpress Studio

Capture leads from **Facebook Messenger** using a Botpress Studio flow that POSTs JSON directly to this app.

## Flow

```
Customer → Messenger (Botpress bot) → POST /api/inbound-facebook-lead → Unassigned lead
```

## API

| | |
|--|--|
| **URL** | `POST https://<your-vercel-domain>/api/inbound-facebook-lead` |
| **Auth** | Header `x-inbound-secret: <INBOUND_SECRET>` (Vercel env) |
| **Content-Type** | `application/json` |

### Request body

| Field | Required | Description |
|-------|----------|-------------|
| `org` | Yes | Franchise `orgs.slug` (e.g. `fieldbourne`) |
| `name` | Yes | Customer name |
| `phone` | Yes | AU phone (normalised to E.164 server-side) |
| `message` | No | Free-text enquiry; if empty, `city` is used to build details |
| `city` | No | Town/city from the form (stored as address when no message) |
| `email` | No | If the form collects it |
| `website` | No | **Honeypot** — must be empty or request is rejected |

### Example JSON

```json
{
  "org": "fieldbourne",
  "name": "{{event.payload.name}}",
  "phone": "{{event.payload.phone}}",
  "city": "{{event.payload.city}}",
  "message": "{{event.payload.message}}",
  "website": ""
}
```

### Botpress HTTP action

In Botpress Studio, add an **HTTP Request** (or Execute Code + fetch) step after collecting lead fields:

| Setting | Value |
|---------|-------|
| **URL** | `https://<your-vercel-domain>/api/inbound-facebook-lead` |
| **Method** | `POST` |
| **Header** | `Content-Type` → `application/json` |
| **Header** | `x-inbound-secret` → `<INBOUND_SECRET from Vercel>` |
| **Body** | JSON (see example above) |

Hardcode `org` to the franchise slug for this bot. Map Botpress variables into `name`, `phone`, `message`, and optional `city` / `email`.

### Responses

| Status | Body | Meaning |
|--------|------|---------|
| `200` | `{ "success": true, "lead_id": "uuid" }` | Lead created |
| `200` | `{ "skipped": true, "reason": "unknown_org" }` | Bad `org` slug — captured in `unrouted_inbound` |
| `200` | `{ "skipped": true, "reason": "inbound_messenger_disabled" }` | Feature switch off |
| `400` | `{ "error": "..." }` | Validation / honeypot |
| `401` | `{ "error": "Unauthorized" }` | Wrong or missing secret |

## Prerequisites (app)

1. **`INBOUND_SECRET`** set on the Vercel environment Botpress calls.
2. Migration `20260713140000_inbound_facebook_lead.sql` applied (adds `inbound_messenger` switch).
3. **Platform → Feature switches** — enable **Inbound Meta Messaging** for the client brand/org.
4. Deploy includes `vercel.json` rewrite for `/api/inbound-facebook-lead`.

## Test with curl

```bash
curl -s -X POST "https://<domain>/api/inbound-facebook-lead" \
  -H "Content-Type: application/json" \
  -H "x-inbound-secret: YOUR_INBOUND_SECRET" \
  -d '{
    "org": "fieldbourne",
    "name": "Test User",
    "phone": "0412345678",
    "message": "Test Messenger enquiry from curl",
    "website": ""
  }'
```

## Lead fields

- `source`: `facebook_messenger`
- `lead_source`: `Facebook Messenger`
- Status: `unassigned` (team) or `assigned` (solo inbound assignment)

Manager notify and customer ack SMS follow existing feature switches (`manager_new_lead_alerts`, `lead_ack_sms`) when enabled.

## Not used

- `/api/meta-webhook` / `META_APP_SECRET`
- `org_facebook_pages` / Facebook `page_id`
- CloudMailin / email plus-tag routing
- Make.com
