# Native Facebook Messenger bot (companion)

Replaces Botpress for **TV Magic South Brisbane** Page chats. Same outcome: answer from the South Brisbane knowledge pack, never quote prices, capture name + mobile, wait ~90s for suburb, insert an unassigned lead.

Botpress can stay attached until App Review is through. Rollback: re-authorize the old Botpress bot on the Page.

## Env (Vercel Production)

| Variable | Purpose |
|---|---|
| `META_APP_SECRET` | HMAC for `x-hub-signature-256` |
| `META_WEBHOOK_VERIFY_TOKEN` | Token you type into Meta's webhook verify field |
| `META_PAGE_ACCESS_TOKEN` | Page access token (or store `page_access_token` on `org_facebook_pages`) |
| `ANTHROPIC_API_KEY` | Receptionist replies (regex fallback if unset) |

Webhook URL: `https://tv-magic-companion.vercel.app/api/meta-webhook`  
Subscribe to **messages**. Verify GET challenge with `META_WEBHOOK_VERIFY_TOKEN`.

## Database

1. Apply [`supabase/migrations/20260828140000_messenger_sessions.sql`](../supabase/migrations/20260828140000_messenger_sessions.sql) on **dev then prod** (ledger is disjoint — do not `db push` prod).
2. `org_facebook_pages` row: South Brisbane `page_id` → org slug `default`.

## Meta (operator)

1. developers.facebook.com → app → Messenger product.
2. Webhook callback = production URL above. Verify token = env.
3. Generate a Page token for the South Brisbane Page only. Paste into Vercel or the `org_facebook_pages.page_access_token` column.
4. **Development mode:** add yourself as tester. Message the Page from that Facebook user.
5. **Customers:** App Review for `pages_messaging`. Keep Botpress on the Page until that is approved.
6. Cutover: Botpress → Messenger → disconnect this Page. Confirm Meta webhook is the only subscriber.
7. Rollback: Botpress old bot → Authorize Messenger → same Page.

## Behaviour

- Knowledge is embedded from `docs/kb/tvmagic-south-brisbane/` in `api/_lib/messengerKb.ts` (Vercel functions cannot read `docs/` at runtime).
- Name + AU mobile required. No phone after two asks → 0449 947 247, no lead.
- Suburb missing → ask once, `awaiting_suburb_until` = now + 90s. A later reply is the suburb. Silence is closed by `/api/cron/messenger-suburb-timeout` (GitHub Actions every 5 minutes).
- Lead insert reuses `ingestParsedFacebookLead` (`channel: messenger`, `conversation_id` = `{pageId}_{psid}`).

## Feature switch

`inbound_messenger` must stay **on** for the brand or the webhook ignores messages.
