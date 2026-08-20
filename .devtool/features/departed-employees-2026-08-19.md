---
id: "departed-employees-2026-08-19"
status: "review"
priority: "medium"
assignee: null
epic: "Team management"
dueDate: null
created: "2026-08-19T10:30:00.000Z"
modified: "2026-08-20T12:20:00.000Z"
completedAt: null
labels: ["team", "data-retention", "roadmap"]
order: "Z2"
---

# Departed employees — keep the history, drop them from operations

Owner request, 19-08-2026. Mitch Singe has left TV Magic. To keep his data rather than delete
him, he was flagged `is_hidden_test_profile = true` — the only lever available. That flag was
built for a different job and does the wrong thing here.

## Why

`is_hidden_test_profile` and "this person has left" want **opposite** treatment in reporting:

- A **test profile** should be scrubbed from stats — it is noise.
- A **departed employee** should stay in stats for the period they worked — it is history.

Today they get the same treatment, and it is the test-profile one. `isProfileVisibleToViewer`
([src/lib/profileVisibility.ts](../../src/lib/profileVisibility.ts)) shows a hidden profile only
to itself or its `test_profile_owner_id`. Mitch's owner is **Demo Manager**, so **Nick cannot see
Mitch or his history at all** — the precise opposite of the reason he was hidden rather than deleted.

Verified on prod 19-08-2026: Mitch has 0 leads assigned, 0 notifications in 30 days (every active
tech has 2,500-10,500), and last signed in 21-06-2026. The routing exclusion is working; the data
retention is not.

Secondary evidence the flag is overloaded: `notifyManagersNewLead` does **not** filter
`is_hidden_test_profile` ([api/_lib/notifyManagersNewLead.ts:34-35](../../api/_lib/notifyManagersNewLead.ts#L34-L35)),
so `Demo Manager` still receives real new-lead alerts (6 in 30 days) while being hidden everywhere
else. Two mechanisms disagreeing about what "hidden" means.

## Spec

Add `profiles.departed_at timestamptz` (nullable; NULL = active). Distinct from
`is_hidden_test_profile`, which stays as-is for genuine test accounts.

**Excluded when `departed_at` is set:**

- Auto-assign candidate query ([api/_lib/teamInboundLead.ts:55](../../api/_lib/teamInboundLead.ts#L55)) — alongside the existing `is_hidden_test_profile` filter
- Manager new-lead alerts (and fix that call site to filter hidden test profiles too — it currently does not)
- Team pickers, assignment UI, `TeamExclusionsPanel`, `useOrgProfiles`
- The current week's leaderboard and any "active team" count
- App access — a departed employee should not be able to sign in

**Retained when `departed_at` is set:**

- All `leads`, `lead_events`, `invoices` and photo attribution, unchanged
- Historical leaderboard weeks they actually worked
- Historical reporting periods — they show in a month they worked, not in later ones
- Visible to managers in history views, clearly marked as departed. **This is the whole point of
  the card** and the thing the current workaround gets wrong.

**UI:** `OrgMembersPanel` already has a hide/unhide action ([src/components/platform/OrgMembersPanel.tsx:69](../../src/components/platform/OrgMembersPanel.tsx#L69)) — add "Mark as departed" / "Reinstate" next to it, and label the two states differently so they stop being confused.

**Migration:** additive, `ADD COLUMN IF NOT EXISTS`. Dev, then prod, then code.

**Data fix on ship:** set `departed_at` on Mitch Singe and clear his `is_hidden_test_profile` /
`test_profile_owner_id`, so his history returns to Nick's view.

## Feature switch

**None.** This is an org-management primitive and a data-correctness fix, not a rollout-gated
behaviour — and `dd19` (cut the catalog from 34 toward 12) argues against a 35th switch for
something with no meaningful "off" state. Flagged per the standing convention rather than assumed.

## Done when

- Marking someone departed removes them from routing, alerts, pickers and the current leaderboard, and signs them out
- Their past leads, events and leaderboard weeks are still visible to a manager, labelled as departed
- Mitch Singe is `departed_at`-marked, no longer a "test profile", and Nick can see his history
- `is_hidden_test_profile` means only "test account" again, consistently across auto-assign *and* manager alerts

**Difficulty:** Medium — one column, but many read sites.

## Built — v1.1.182, 20-08-2026

Migration `20260820120000_departed_employees.sql` adds the column and carries the Mitch Singe
fix (guarded on the hidden flag, so it is a no-op in dev and on any re-run). **Not yet applied
to dev or prod.**

Two decisions worth recording, because neither is in the spec above:

- **What counts as "a week they actually worked"** is *a saved leaderboard entry for that
  week*, not `departed_at` compared against the week's dates. Comparing dates would put an
  unscored zero row on every week before someone's last day; the entry is the proof.
  `mergeRosterWithEntries` takes `keepDepartedWithEntries`, which `LeaderboardPage` sets from
  `!isCurrentWeek(weekStart)`. Same shape in reporting: a departed profile gets no empty seed
  row, so they surface in a month only when an event or snapshot names them.
- **`fetchOrgProfiles` excludes departed people by default** and takes `includeDeparted` for
  the history views. That one seam covers the assign modal, calendar, leads page, team
  workload and `TeamExclusionsPanel` without touching any of them.

App access is client-enforced in two places, matching how the rest of this codebase gates:
`Login.tsx` blocks a fresh sign-in, and `ProtectedRoute` closes the window on a session that
was already live when the person was marked departed. RLS is unchanged — a departed user can
still read their own row, exactly as a hidden test profile can.

## Related

- Workaround this replaces: `is_hidden_test_profile` (see [[prod-demo-test-accounts]])
- Adjacent: `assignment_exclusions` (T1.14) excludes by *keyword*, and cannot express "never assign anything"
