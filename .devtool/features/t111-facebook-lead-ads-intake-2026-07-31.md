---
id: "t1-11-facebook-lead-ads-intake-2026-07-31"
status: "in_progress"
priority: "high"
assignee: null
epic: null
dueDate: "2026-07-31"
created: "2026-07-31T00:00:00.000Z"
modified: "2026-07-31T00:00:00.000Z"
completedAt: null
labels: ["roadmap", "t1", "lead-intake"]
order: "a1"
---
# T1.11 Facebook Lead Ads intake

Client started running FB Ads and is hand-copying leads out of Meta Leads Center. `channel: "lead_ads"` discriminator added to the existing `/api/inbound-facebook-lead` endpoint; Make.com free tier bridges the Lead Ads instant trigger to it. Ad leads get their own `facebook_lead_ads` source so ad ROI stays measurable.

**Code done 31-07-2026** — endpoint, `inbound_facebook_ads` switch, retry path, tests (505 pass), `docs/FACEBOOK_LEAD_ADS.md`. Not yet deployed.

**Remaining:** changelog + version bump, deploy, apply migration `20260731120000_inbound_facebook_ads.sql` to prod, enable the switch for the client's brand, build the Make scenario, UAT a real form submission. Existing 11 leads go in by hand via Add Lead.

**Depends on:** [[t1-10]] Stage-3 switches for ack SMS / manager alerts to fire.
