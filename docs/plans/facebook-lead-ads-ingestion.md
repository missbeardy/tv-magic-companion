# Facebook Lead Ads ingestion — tv-magic

## Context

The client (TV Magic, org slug `default`, brand `tv-magic`) is running Facebook Lead Ads. Leads submitted through the ad's instant form currently sit only in Meta's Leads Center and are being hand-copied — the ask was to get them ingested into the app automatically.

Exploration turned up something important: **the app side of this was already built.** `T1.11 Facebook Lead Ads intake` shipped in v1.1.148 (31-07-2026) and the `.devtool` card was closed 19-08-2026:

- Endpoint `POST /api/inbound-facebook-lead` (hub-routed via `api/inbound-email.ts?action=facebook-lead` → [api/_lib/handleInboundFacebookLead.ts](../../api/_lib/handleInboundFacebookLead.ts)) — validates, dedups, raw-first inserts, runs Claude extraction with a regex fallback, and fires the standard ack-SMS / manager-alert follow-up via `processInboundLead`.
- Feature switch `inbound_facebook_ads` exists (migration [supabase/migrations/20260731120000_inbound_facebook_ads.sql](../../supabase/migrations/20260731120000_inbound_facebook_ads.sql)).
- `lead_ack_sms` and `manager_new_lead_alerts` are already on for tv-magic, so ack SMS + manager push will fire on new Lead Ads leads with no further switch work.
- Fully documented in [docs/FACEBOOK_LEAD_ADS.md](../FACEBOOK_LEAD_ADS.md), with 503 passing tests.

**Verified live 24-08-2026** (don't trust the "done" card alone — it was stale on switch state): `POST /api/inbound-facebook-lead` on prod returns `401` for a bad secret, exactly as documented — the endpoint is genuinely deployed and functioning. `INBOUND_SECRET` is confirmed set on Vercel Production. However `inbound_facebook_ads` was found **off** for tv-magic in prod (flipped off 2026-08-19 08:29 UTC, around the same time the card was closed) — the card's claim that it was "enabled for tv-magic" is stale. Left off deliberately per owner's call until the Make.com scenario (below) actually exists.

**This is a separate feature from Facebook Messenger.** They share one endpoint file for code reuse but are otherwise fully independent: different trigger platform (Make.com vs Botpress), different `channel` value (`lead_ads` vs `messenger`), different feature switch (`inbound_facebook_ads` vs `inbound_messenger` — the latter is already on and live for tv-magic, unrelated to this work), different `lead_source` tag. Turning Lead Ads on/off has zero effect on the Messenger bot.

Design note (why not a direct Meta webhook): Meta doesn't let a Lead Ads form POST straight to an arbitrary URL — you either integrate via Meta's own Leads Center CRM partner list, or bridge through an automation tool that holds the Facebook OAuth connection. The shipped design uses **Make.com** (free tier covers ~500 leads/month) as that bridge: its Lead Ads trigger is instant (not polled), and its HTTP module is free, unlike Zapier's paid-tier equivalent.

**The remaining gap is entirely operational, not engineering**: the Make.com scenario connecting the client's Facebook Page has never been built (confirmed with the user 24-08-2026) — not something buildable from the repo, since it needs the client's/Nick's Facebook login and Page permissions.

**Superseded 24-08-2026 — decision reversed, see below.** Original recommendation was to finish the Make.com path first since it needed zero new code. That's no longer the plan.

### Why the decision changed: Make's per-form limitation

Make's commonly-documented **"Watch Leads"** trigger for Facebook Lead Ads is scoped to **one specific form** — it does not automatically pick up new forms as new ad campaigns go live. (There are community reports of a page-level "New Lead" module that watches an entire Page, but it's inconsistently documented and at least one user reported it missing/broken — not something to build a production dependency on without hands-on verification in Make's current UI.)

The user confirmed this client (and future clients on this platform) create new Lead Ads forms **often, on a regular basis**. Per-form Make setup would mean manually touching Make every time a new campaign/form goes live — for every client, indefinitely. That's a recurring operational burden, not a one-time setup cost, and doesn't scale for a multi-tenant product.

**Revised recommendation: build the native Meta Leadgen webhook, skip Make.com entirely.** Meta's own webhook subscription is **Page-level**: subscribe a Page's `leadgen` field once via the Graph API, and every form on that Page — including ones created after the subscription — delivers leads automatically. No per-form config, ever. This also removes the Make free-tier volume cap (~500 leads/month) and the third-party dependency.

This is real engineering (not just config), see the new steps below.

## Steps

1. **Verify current live state before touching anything**
   - Re-check `inbound_facebook_ads` for the `tv-magic` brand and that org `default`'s slug hasn't changed, via the Platform → Feature switches UI (or a direct read of `brand_feature_switches`/`orgs` in prod — see prod Supabase ops notes for the Management API approach).
   - Confirm `INBOUND_SECRET` is still set on the Vercel production environment (Vercel dashboard → Project → Environment Variables, or `vercel env ls production`). This is the shared secret Make.com must send as `x-inbound-secret`.

2. **Client-side Facebook setup**
   - Client (or whoever administers the client's Facebook Business assets — likely Nick) needs to be a **Page admin with Leads Access** on the Page running the ads. This is required for Make to connect.

3. **Build the Make.com scenario** (starting from zero, per [docs/FACEBOOK_LEAD_ADS.md](../FACEBOOK_LEAD_ADS.md)):
   - Create/use a Make.com account (free tier).
   - **Trigger**: *Facebook Lead Ads → Watch Leads*. Connect the client's Facebook account, select the Page and the specific ad form.
   - **Action**: *HTTP → Make a request*.
     - `POST https://<vercel-domain>/api/inbound-facebook-lead`
     - Headers: `Content-Type: application/json`, `x-inbound-secret: <INBOUND_SECRET>`
     - Body (raw JSON), mapping trigger fields — critically **`"org": "default"`**, hardcoded (this is the org *slug*, confirmed in the T1.11 card correction — not `"tv-magic"`, which is the brand slug, and not `"fieldbourne"`, a different client):
       ```json
       {
         "channel": "lead_ads",
         "org": "default",
         "name": "{{full_name}}",
         "phone": "{{phone_number}}",
         "email": "{{email}}",
         "city": "{{city}}",
         "form_name": "{{form.name}}",
         "message": "",
         "website": ""
       }
       ```
   - Turn the scenario **ON**.
   - If the client runs more than one ad form, either repeat this per form or add a router inside one scenario — `form_name` is the only per-form signal available (most instant forms collect just name/phone), and it feeds both the lead's stored details and the AI service-type extraction, so map it even though it's optional.

4. **Turn `inbound_facebook_ads` back on for tv-magic** (via Platform → Feature switches) once the Make.com scenario is ready to test — leaving it off is what causes leads to be silently skipped rather than created.

5. **UAT**: submit one real Lead Ads form (not a synthetic curl call — this also proves the live Make connection, not just the endpoint) and confirm within ~a minute:
   - Lead appears in the app, **unassigned**, with `lead_source = "Facebook Lead Ads"`.
   - Ack SMS reaches the test phone number.
   - Manager push notification fires.
   - Check the `unrouted_inbound` table for anything landing there instead (wrong `org` slug or switch-off would show up here rather than failing loudly).

6. **Backfill note (no action needed unless requested)**: the webhook is forward-only. Leads already sitting in Meta Leads Center before the scenario went live will not appear automatically — confirmed prior decision was to add those by hand via **Add Lead** in the app; there's no bulk importer. Flag this to the client if they have existing leads in Meta they want in the app too.

7. **Watch Make's usage**: free tier is 1,000 ops/month (~500 leads, at 2 ops/lead). If the client's ad volume approaches that, that's the trigger to revisit the native Meta Leadgen webhook option described above rather than paying for a higher Make tier.

## Verification

- Make.com scenario's execution history shows a successful run after the UAT submission.
- The lead shows up in the app (Leads page), tagged `Facebook Lead Ads`, unassigned.
- Ack SMS and manager alert both received.
- No unexpected rows in `unrouted_inbound` for `channel = 'facebook_lead'`.
- `curl` fallback for endpoint-only testing (does not exercise the real Make connection, useful only if the UAT lead doesn't show up and you need to isolate app-side vs Make-side):
  ```bash
  curl -s -X POST "https://<domain>/api/inbound-facebook-lead" \
    -H "Content-Type: application/json" \
    -H "x-inbound-secret: YOUR_INBOUND_SECRET" \
    -d '{"channel":"lead_ads","org":"default","name":"Test User","phone":"0412345678","form_name":"TV Aerial Repairs","city":"Brisbane","website":""}'
  ```
