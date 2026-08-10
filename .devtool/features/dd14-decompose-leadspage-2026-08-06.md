---
id: "dd14-decompose-leadspage-2026-08-06"
status: "backlog"
priority: "medium"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-06T17:00:00.000Z"
completedAt: null
labels: ["due-diligence", "tech-debt", "frontend", "maintainability"]
order: "ZG"
---

# DD14 Decompose LeadsPage

`src/pages/LeadsPage.tsx` is **1,412 lines with 22 `useState` and 11 `useEffect`**. It is the most-modified file in the repo, it sits on the money path, and it has **no test coverage of its own**.

The pure logic *was* correctly extracted to `src/lib/` (leadsKanban, leadNextAction, offlineWrites, contactFollowUp, …) and is well tested — that convention is being followed and it works. What was never extracted is the **orchestration**: the state machine coordinating fetch, cache fallback, offline queue, status writes, the completion ceremony, the detail sheet, photos and timers.

Every single Tier 1 item touched this file. That is the tell: it is where the next silent bug will live.

## Spec

Extract to hooks, one at a time, each with tests:

- `useLeadsData` — fetch, cache read-through, stale banner state, refetch.
- `useLeadActions` — status writes, unassign, call/SMS bumps, all routed through the existing `runLeadUpdate` / `offlineWrites` helpers.
- `useCompletionFlow` — checklist open/resume/draft/finish, confetti gating.
- `useLeadSheet` — detail sheet + photo state.

The page component becomes layout + composition.

**Do not change behaviour in the same commit as the extraction.** T1.1–T1.8 fixed real reliability bugs in this file; a refactor that quietly re-introduces one would be the worst possible outcome. Extract, verify green, then change.

**Feature switch:** none.

## Done when

- [ ] `LeadsPage.tsx` is under ~400 lines.
- [ ] Each extracted hook has vitest coverage.
- [ ] Full suite green.
- [ ] Manual pass over the Tier 1 "done when" criteria still holds: offline complete, throttled-3G status write, two-tap call, draft resume.

**Difficulty:** Medium. Not urgent — but it gets more expensive every time the file is touched.

Source: DUE_DILIGENCE_REVIEW.md — Phase 2, I4.
