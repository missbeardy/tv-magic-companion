---
id: "weekly-team-leaderboard-2026-08-19"
status: "done"
priority: "medium"
assignee: null
epic: null
dueDate: "2026-08-19"
created: "2026-08-19T00:00:00.000Z"
modified: "2026-08-19T16:00:00.000Z"
completedAt: "2026-08-19T16:00:00.000Z"
labels: ["feature", "team-operations"]
order: "a2"
---

# Weekly team leaderboard

A team-only `/leaderboard` page: a Monday–Sunday scoreboard of jobs completed and sales
per technician that every employee can see and a manager fills in by hand. Built
19-08-2026 (v1.1.177) from the `weekly-team-leaderboard` plan, with the engagement pass
below following the same day (v1.1.178).

## Why hand-entered

Deliberately **not** derived from `leads` or `invoices`. The figures a franchise owner
wants on the wall are the ones reconciled at the end of the week — cash jobs, split
invoices, warranty work — not what the pipeline happens to have recorded. Derived
reporting stays in the monthly snapshot tables; this is a scoreboard.

## Shipped in this change

- Migration `20260819120000_weekly_leaderboard_entries.sql` — one row per
  `(org_id, technician_id, week_start)`, non-negative `jobs_completed` / `sales_amount(12,2)`,
  a `CHECK (EXTRACT(ISODOW FROM week_start) = 1)` Monday guard, audit columns, and a
  `BEFORE INSERT OR UPDATE` trigger that rejects a technician who is not an `employee`
  in the row's own org (RLS validates the row's `org_id`, not the technician's).
- RLS: same-org authenticated read for everyone; insert/update restricted to
  `manager` / `platform_admin`. **No DELETE policy** — a week is corrected by editing it
  back to zero, never by removing history.
- [`src/lib/leaderboard.ts`](src/lib/leaderboard.ts) — Monday week maths on *local*
  calendar days (never `toISOString()`), AUD formatting, jobs/sales validation, roster
  merge, deterministic sort, draft diffing, fetch, and one idempotent bulk upsert.
- [`src/pages/LeaderboardPage.tsx`](src/pages/LeaderboardPage.tsx) — podium + table,
  week navigation, manager inline editing.
- `teamOnly` flag on [`src/lib/navConfig.ts`](src/lib/navConfig.ts) replacing the
  hardcoded `/activity` solo-mode exclusion; `/leaderboard` and `/activity` both carry it.
- Route lazy-loaded from [`src/App.tsx`](src/App.tsx) — 19.5 kB own chunk, off the
  login → leads critical path.

## Decisions worth remembering

- **No feature switch** (owner decision, 19-08-2026). Team-only nav filtering is the only
  gate; `feature: null`, so it is not Pro-gated. Consistent with `dd19` (cut the switch
  catalog), and the page is inert for an org with no employees anyway.
- **Roster is authoritative, not the saved rows.** Every visible employee appears with
  zeros; a saved row for someone since hidden by `profileVisibility` or moved off
  `employee` does not resurrect them onto the board.
- **Sales desc → jobs desc → name asc.** The full tie-break matters: an all-zero week
  must produce the same order on every render or the podium reshuffles for no reason.
- **The podium hides while editing** so rows cannot reorder under a manager's cursor,
  and the week controls are disabled while editing so typed values cannot vanish.
- **Confetti** — superseded same day by the reveal below. Kept here only as the reason:
  it fired on every save and carried no information.

## Verification done

- `tests/leaderboard.test.ts` (29) — Monday boundaries incl. the Sunday edge, blocked
  future weeks, roster merge, sort/tie-break, jobs/sales validation, draft diffing.
- `tests/LeaderboardPage.test.tsx` (19) — loading/empty/all-zero/error+retry, employee
  read-only, manager upsert payload and `onConflict`, invalid-value refusal, disabled
  week controls while editing, and podium hidden while editing.
- `tests/navConfig.test.ts` extended — employee/manager/platform-admin visibility, not
  Pro-gated, team-only filtering, unchanged three-tab mobile contract.
- `tests/databaseContract.assert.ts` extended — the new columns are a compile-time gate.
- Full `npm test` (724), `npm run typecheck`, `npm run build` green.

## Engagement follow-up (v1.1.178, same day)

Owner asked for something better than confetti: a notification at a set time, opening the
board, with the load itself being the moment.

- **Confetti removed.** It fired on every save and said nothing. Replaced with **one
  orchestrated reveal** — curtain, then 3rd → 2nd → 1st, then the board settles. Plays
  **once per week per device** via localStorage. Not a table on purpose: seeing it twice
  across two devices is harmless, and it is not worth a schema, a write on every page
  view, or a round trip before the animation can start.
- **The information changes matter more than the motion.** A "You" card with the viewer's
  own standing, the **gap to the person above**, and **movement arrows** vs last week.
  The gap is the one to keep: "$460 behind Zed" is a target, "2nd place" is a label.
- **Weekly nudge**, per-brand switch `weekly_leaderboard_nudge` (default off, migration
  `20260819130000`). Two phases on **different days, about different weeks** (owner chose
  the times, 19-08-2026): Saturday 17:00 Sydney reminds the **manager** about the week
  that is closing, and only while it is still empty; Monday 08:00 tells the **team** how
  *last* week finished, and only when there is something to show.
- **Monday means the reveal is about last week.** Monday's own week is empty by
  definition, so the reveal steps back seven days and the push carries `?week=`; the page
  opens on the week the link names (falling back to the current week if it is malformed or
  in the future). A past week reached with the arrows still does *not* auto-reveal — only
  a link does — so browsing history stays quiet.
- **Bug caught while moving the times:** the send dedupe was keyed on the *scored* week.
  Once the reveal ran a week after the week it celebrates, that window reached back over
  the previous Monday's send and would have silenced every reveal after the very first
  one, permanently. Now anchored to send time (3-day lookback: far more than the ~1h
  between the two DST ticks, far less than the 7 days to the previous send), with a named
  regression test.
- **The empty-week skip is the feature, not a nicety.** A notification that opens an empty
  board is exactly how you train people to ignore notifications.
- **Does not use `notifyOrgUser`.** That function fans out to SMS/WhatsApp for every `type`
  outside its two special cases — a weekly text to every technician is real money and real
  annoyance. `api/_lib/leaderboardNudge.ts` writes the bell row and calls `sendPushToUsers`
  directly, which also matches the direction the follow-up architecture card wants (narrow
  explicit intents, not `type` as a transport switch).
- **DST is handled, not ignored.** GitHub schedules in UTC only, so each phase fires at
  both candidate UTC hours and `shared/leaderboardWeek.ts` decides which one is really
  08:00/16:00 in Sydney. Double firing is safe regardless — sends are deduped per week
  against `notifications`.
- Routed as `?action=leaderboard-nudge` on the `send-sms` hub. Still **11/12** Vercel
  functions.
- `workflow_dispatch` on the workflow takes a phase and a `force` flag, so a real send can
  be fired on demand during UAT without waiting for Friday.
- 50 further tests: `tests/leaderboardWeek.test.ts` (13, incl. DST and UTC-vs-Sydney week
  boundaries), `tests/leaderboardNudge.test.ts` (17, incl. every skip path and the dedupe),
  plus reveal / You-card / movement coverage on the page. 774 total.

## Shipped to production 19-08-2026 (v1.1.180, commit `ffa1486`)

Deployed with `readyState: READY`, `target: production`, aliased at
`tv-magic-companion.vercel.app`. Source pushed to `main` — git, prod and both databases
agree.

**Migrations verified rather than assumed** (the standing lesson from the messaging
migration that was absent from prod despite being reported as applied):

| | dev | prod |
| --- | --- | --- |
| `20260819120000` leaderboard table | ✅ | ✅ trigger, 3 policies, 3 CHECKs, RLS on |
| `20260819130000` nudge switch | ✅ | ✅ catalog row, **off** for both brands |

Smoke checks on the public alias: `/api/cron/leaderboard-nudge` → **401** (module loaded,
cron auth ran), `/api/cron/contact-follow-up` → **401**, `GET /api/send-sms` → **405**,
`/leaderboard` → **200**. A 500 on the first would have meant the `send-sms` hub was down,
taking cron, booking confirmations and public quote links with it.

Prod reach at ship time: **TV Magic South Brisbane has 4 visible employees**, so Nick's
team has the tab now. `fieldbourne` orgs have none, so the tab is inert there.

## Still open (deliberately)

- [ ] **`weekly_leaderboard_nudge` is off for `tv-magic`.** Owner's call to enable in
      Platform Admin. Until then the cron runs and sends nothing, by construction.
- [ ] **Push permission coverage is unknown.** The reveal works for everyone; the nudge
      that drives people to it reaches nobody who never tapped Allow. Worth measuring
      before judging whether the notification half earns its keep.
- [ ] **Prod has zero leaderboard rows.** Nick sees the all-zero state until he posts a
      first week. That is also why no nudge can fire yet — the reveal skips an empty board.
- [ ] **The motion has never been fully verified in a browser.** One real check happened
      and it found a genuine bug (first place invisible); the fix for it, and the rest of
      the sequence, have only been verified as shipped CSS and passing tests.

## Follow-ups worth considering, not scheduled

- No **history view** across weeks — each week loads on its own. The most likely next ask
  for anyone using this daily.
- Nothing derives the numbers from the pipeline, and that is deliberate. A "prefill from
  completed leads" button is the obvious next request; it should stay a *suggestion* a
  manager overrides, never an automatic write.
- `notifyOrgUser` still uses a free-form `type` as a transport switch. This feature routed
  around it rather than adding another special case; see
  `contact-follow-up-lifecycle-rebuild-2026-08-18` Phase 3 for the real fix.
