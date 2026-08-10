---
id: "dd18-delete-the-dead-code-t28-missed-2026-08-06"
status: "backlog"
priority: "medium"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-06T17:00:00.000Z"
completedAt: null
labels: ["due-diligence", "tech-debt", "subtraction"]
order: "ZD"
---

# DD18 Delete the dead code T2.8 missed

T2.8 (engineering hygiene, shipped v1.1.140) claimed to delete dead modules. These survived and were found in the 06-08-2026 audit.

**Delete:**

1. **Tasks feature, end to end** — `tasks` + `task_items` tables, orphaned `TaskBoardPage.tsx`, and **the dead `/tasks` route still advertised in `BillingPanel.tsx`**. A billing panel selling a feature that does not exist is a trust problem, not just debt. Requires a migration to drop the tables (sequence after `t27` prod reconciliation, or apply to both via the Management API).
2. **`api/_rateLimit.js`** — a `.js` file containing TypeScript generics. Would be a runtime syntax error if imported; nothing imports it. (Also covered by `dd4`; whichever lands first.)
3. **`public/tvmagic-logo.png`** — byte-identical to `fieldbourne-logo.png` (md5 `25e189f5…`). Brand assets belong in the `brands` table, not the shell. (Coordinates with `dd6`.)
4. **One of the two manifests** — `public/manifest.json` (static, linked) vs `manifest.webmanifest` (generated from a duplicate config block in `vite.config.ts`, referenced by nothing). Both ship in `dist/`. (Coordinates with `dd6`.)
5. **`supabase/functions/push-notify`** — unmodified "Hello from Functions!" scaffold, still deployed, unused since T1.9. Remove via the Supabase dashboard.
6. **Social posting** — `SocialPage.tsx` (512 lines), `LeadSocialModal.tsx`, `api/social-post.ts`, `src/lib/generateCaption.ts`, the Zernio integration. **This is the existing `t36` card's decision — the review's recommendation is DELETE.** Nothing to do with never losing a lead; parked; its server gate was never UAT'd. Frees a Vercel function slot and ~700 lines. Tracked on `t36`; listed here so the sweep is complete.
7. **Legacy `FEATURES` tier map** coexisting with the switch catalog (known debt, T2.8 partial).

**Check before deleting:** `generateCaption.ts` may be a caller in `dd5`'s LLM-proxy migration — delete it here and that migration gets smaller.

**Feature switch:** none. Removes surface.

**Done when:** greps for `TaskBoard`, `task_items`, `_rateLimit`, `tvmagic-logo`, `SocialPage`, `push-notify` all return empty; typecheck + 534 tests still green; the `/tasks` link is gone from BillingPanel; one manifest in `dist/`.

**Difficulty:** Easy, except the table drop (Medium — coordinate with prod schema state, `t27`).

Source: DUE_DILIGENCE_REVIEW.md — Phase 4, Phase 8 Remove items 23–25.
