# Facebook Messenger lead via Botpress

Capture leads from **Facebook Messenger** using Botpress, posting JSON to this app.

> For **Facebook Lead Ads** instant forms (paid ads), see [FACEBOOK_LEAD_ADS.md](FACEBOOK_LEAD_ADS.md).
> Same endpoint, `channel: "lead_ads"`, separate feature switch.

## Rollback (read this first)

The live Page still uses the **old structured Botpress bot** until you attach a new one. Companion changes are additive: the old payload still works.

| If this happens | Do this | Customer chat | Leads in the app |
|-----------------|--------|---------------|------------------|
| New Gen-AI bot answers badly | Botpress → Messenger integration → point it back at the **old bot**. Do not delete the old bot. | Back to the old flow within about a minute | Unchanged |
| Leads flood / junk | Platform → Feature switches → turn **Inbound Meta Messaging** off for tv-magic | Bot still chats | New Messenger leads stop inserting |
| Webhook 500s after a companion deploy | Revert that Vercel deploy | Depends on Botpress | Old deploy still accepted the same JSON |

Do **not** edit the live structured bot in place. Build the Gen-AI agent as a **new** Botpress bot, test in the emulator, then swap the Messenger integration once — swap back if needed.

Knowledge pack and copy-paste instructions: [docs/kb/tvmagic-south-brisbane/](kb/tvmagic-south-brisbane/README.md).

## Flow

```
Customer → Messenger (Botpress) → POST /api/inbound-facebook-lead → Unassigned lead
```

TV Magic South Brisbane must send `"org": "default"` (the org slug). `"tv-magic"` is the brand slug and lands in `unrouted_inbound`.

## API

| | |
|--|--|
| **URL** | `POST https://<your-vercel-domain>/api/inbound-facebook-lead` |
| **Auth** | Header `x-inbound-secret: <INBOUND_SECRET>` (Vercel env) |
| **Content-Type** | `application/json` |

### Request body — live structured bot (keep this working)

| Field | Required | Description |
|--|--|--|
| `org` | Yes | Franchise `orgs.slug` (`default` for South Brisbane) |
| `name` | Yes | Customer name |
| `phone` | Yes | AU phone (normalised to E.164 server-side) |
| `message` | No | Free-text enquiry; if empty, `city` is used to build details |
| `city` | No | Town/city from the form (stored as address when no message) |
| `email` | No | If the form collects it |
| `website` | No | **Honeypot** — must be empty or request is rejected |

```json
{
  "org": "default",
  "name": "{{event.payload.name}}",
  "phone": "{{event.payload.phone}}",
  "city": "{{event.payload.city}}",
  "message": "{{event.payload.message}}",
  "website": ""
}
```

### Extra fields — Gen-AI agent only (all optional)

Omit these on the old bot. Sending them is what turns on the technician card + duplicate guard.

| Field | Description |
|--|--|
| `conversation_id` | Botpress conversation id. Enables idempotency (same chat will not create a second lead or a second manager alert). |
| `suburb` | Stored as address when present |
| `service_needed` | Short job phrase; folded into details and service-type fallback |
| `out_of_area` | `true` / `"yes"` if they are not South Brisbane |
| `channel` | `"messenger"` (default) |

```json
{
  "org": "default",
  "channel": "messenger",
  "name": "Jane Citizen",
  "phone": "0412345678",
  "suburb": "Annerley",
  "service_needed": "Wall mount 75 inch plaster",
  "out_of_area": false,
  "message": "Asked about pricing; told a tech will quote on the call.",
  "conversation_id": "{{event.conversationId}}",
  "website": ""
}
```

Idempotency runs **only** when `conversation_id` is present. The live structured bot is unchanged.

Duplicate response (treat as success in Botpress): `{ "success": true, "lead_id": "...", "duplicate": true }`.

### Botpress HTTP action

| Setting | Value |
|--|--|
| **URL** | `https://<your-vercel-domain>/api/inbound-facebook-lead` |
| **Method** | `POST` |
| **Header** | `Content-Type` → `application/json` |
| **Header** | `x-inbound-secret` → `<INBOUND_SECRET from Vercel>` |

Hardcode `org` to `default` for South Brisbane.

### Responses

| Status | Body | Meaning |
|--|--|--|
| `200` | `{ "success": true, "lead_id": "uuid" }` | Lead created |
| `200` | `{ "success": true, "lead_id": "uuid", "duplicate": true }` | Same conversation already captured — do not retry |
| `200` | `{ "skipped": true, "reason": "unknown_org" }` | Bad `org` slug — captured in `unrouted_inbound` |
| `200` | `{ "skipped": true, "reason": "inbound_messenger_disabled" }` | Feature switch off |
| `400` | `{ "error": "..." }` | Validation / honeypot |
| `401` | `{ "error": "Unauthorized" }` | Wrong or missing secret |

## Cutover (when you are ready — not part of a companion deploy)

1. Duplicate or create a **new** Botpress bot. Leave the live one alone.
2. Autonomous Agent + instructions from `docs/kb/tvmagic-south-brisbane/AGENT_INSTRUCTIONS.md`.
3. Knowledge Base: upload `identity-and-rules.md`, `services.md`, `south-brisbane.md`. Do not crawl the whole website.
4. One **Submit lead** HTTP tool as above. Fire once per conversation after name + phone.
5. Emulator tests: service question (no price), name/phone/suburb, out-of-area flag, no-phone → 0449 947 247 and no webhook.
6. Curl the webhook with a South Brisbane payload (`org: default`) and confirm the lead is unassigned, `lead_source = Facebook Messenger`, manager alert + customer ack SMS.
7. Point Messenger at the new bot on the **South Brisbane Page** only.
8. One real Messenger test from your phone. If anything feels worse than the old bot, swap Messenger back immediately.

## Prerequisites (app)

1. **`INBOUND_SECRET`** set on the Vercel environment Botpress calls.
2. Migration `20260713140000_inbound_facebook_lead.sql` applied (adds `inbound_messenger` switch).
3. **Platform → Feature switches** — enable **Inbound Meta Messaging** for the client brand/org.
4. Deploy includes `vercel.json` rewrite for `/api/inbound-facebook-lead`.

## Test with curl

Legacy payload (what the live bot sends):

```bash
curl -s -X POST "https://<domain>/api/inbound-facebook-lead" \
  -H "Content-Type: application/json" \
  -H "x-inbound-secret: YOUR_INBOUND_SECRET" \
  -d '{
    "org": "default",
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

## Native Messenger bot

The companion can own the Page without Botpress. See [META_MESSENGER.md](META_MESSENGER.md). Keep this Botpress doc until the Page has been stable on native for a week.

## Not used (Botpress path)

- CloudMailin / email plus-tag routing
- Make.com (Lead Ads is a separate channel)
