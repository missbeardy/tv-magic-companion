---
id: "first-job-game-lead-intake-2026-09-28"
status: "in-progress"
priority: "medium"
assignee: null
dueDate: null
created: "2026-09-28T00:00:00.000Z"
modified: "2026-09-28T00:00:00.000Z"
completedAt: null
labels: ["inbound", "lead-intake", "marketing", "game"]
order: "a1"
---

# First Job game lead intake

Owner request 28-09-2026. Spec: "TV Magic: First Job, Game Spec" (Darren, 28-09-2026).
ROADMAP block: **T1.19**.

A 2-minute mobile pixel-art game (separate static project, sibling folder
`tv-magic-first-job`) ends in a lead form. The game's own `/api/lead` function forwards
server-to-server to the Companion.

## Companion side (this repo)

- `POST /api/game-lead` → `inbound-email?action=game-lead` (hub reuse, no new function)
- Auth: `x-game-lead-secret` header vs `GAME_LEAD_SECRET`. Unset = off.
- **No feature switch** (owner decision 28-09-2026).
- Org: `GAME_LEAD_ORG_SLUG`, default `default` (TV Magic).
- Raw-first lead, `source: first-job-game`, `lead_source: First Job game`, dedup by phone,
  early 200 once the row exists, manager alert + ack SMS under `waitUntil`.
- Parser + mapping in `shared/gameLead.ts`, tests in `tests/gameLead.test.ts`.

## Open (owner)

- Brand hex codes, final discount code/terms, privacy URL + game domain, Nick sign-off on facts.
- Set `GAME_LEAD_SECRET` in Companion prod env and the game's Vercel project (same value).
