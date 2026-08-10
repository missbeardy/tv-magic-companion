---
id: "t1-11-facebook-lead-ads-intake-2026-07-31"
status: "in-progress"
priority: "high"
assignee: null
dueDate: "2026-07-31"
created: "2026-07-31T00:00:00.000Z"
modified: "2026-08-06T17:00:00.000Z"
completedAt: null
labels: ["roadmap", "t1", "lead-intake"]
order: "a1"
---
# T1.11 Facebook Lead Ads intake

Client started running FB Ads and is hand-copying leads out of Meta Leads Center. `channel: "lead_ads"` discriminator added to the existing `/api/inbound-facebook-lead` endpoint; Make.com free tier bridges the Lead Ads instant trigger to it. Ad leads get their own `facebook_lead_ads` source so ad ROI stays measurable.

**Deployed 31-07-2026 (v1.1.148)** — endpoint, `inbound_facebook_ads` switch, retry path, tests (503 pass), `docs/FACEBOOK_LEAD_ADS.md`. Migration was already applied to prod ahead of this deploy (catalog + brand-switch rows existed before the deploy, from an earlier out-of-band Management-API run — not tracked in `supabase_migrations`). `inbound_facebook_ads` is now **enabled for `tv-magic`** (brand `b0000000-...-0001`). Confirmed the client's org slug is `default` (org "TV Magic South Brisbane", the only org on this brand) — use `org: "default"` in the Make scenario body, not `fieldbourne` (that's a different brand/client) and not `tv-magic` (that's the brand slug, not the org slug).

**Correction to this card's original "Depends on":** T1.10 is not fully deferred — prod already has `lead_ack_sms: true` and `manager_new_lead_alerts: true` for `tv-magic` (enabled out-of-band, undocumented, discovered 31-07-2026). Only `lead_ack_email` is still off (left off deliberately, owner's call 31-07-2026 — not part of this item's scope). So ack **SMS** and **manager push** will already fire on new Lead Ads leads; only the email ack won't.

**Remaining before this can move to done/:**
1. Build the Make.com scenario (Facebook Lead Ads trigger → HTTP POST) — needs Nick's Facebook Page connected in Make with Leads Access; owner/Nick action, not buildable from here.
2. UAT: submit a real Lead Ads form once Make is wired up, confirm the lead lands unassigned, attributed to `lead_source: "Facebook Lead Ads"`, with ack SMS + manager push firing within ~a minute. (Deferred by owner 31-07-2026 rather than running a synthetic curl test that would fire a real SMS/push.)

Existing 11 leads in Meta Leads Center go in by hand via Add Lead — no importer built (confirmed decision, forward-only webhooks).

**Depends on:** [[t1-10]] — partially live for `tv-magic` already (see correction above); full T1.10 UAT (incl. `lead_ack_email`) still open separately.
