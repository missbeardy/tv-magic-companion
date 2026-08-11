---
id: "t3-6-social-revive-or-remove-2026-07-24"
status: "done"
priority: "low"
assignee: null
dueDate: "2026-07-24"
created: "2026-07-24T12:00:00.000Z"
modified: "2026-08-11T03:20:00.000Z"
completedAt: "2026-08-11T02:20:00.000Z"
labels: ["roadmap", "t3"]
order: "a5"
---
# T3.6 Social posting: revive or remove

**Done — removed** (decision: DELETE). Shipped in v1.1.168.

## Removed
- `SocialPage.tsx`, `LeadSocialModal.tsx`, `useSocialPost.ts`, `generateCaption.ts`, `uploadMedia.ts`
- `api/social-post.ts` (Vercel function slot freed)
- Caption path on `/api/anthropic` (`generate-caption` / `buildCaptionPrompt`)
- Pro `social` feature key, nav `/social`, BillingPanel + PlatformAdmin copy
- Vercel env: `ZERNIO_API_KEY`, `ZERNIO_FB_ACCOUNT_ID`

## Untouched
Meta inbound (Messenger / IG DM / Lead Ads), `lead_photos`, lead-field AI extraction.

Also closes **dd18 item 6**.
