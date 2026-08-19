---
id: "t1-6b-org-configurable-checklist-2026-07-24"
status: "done"
priority: "medium"
assignee: null
dueDate: "2026-07-24"
created: "2026-07-24T12:00:00.000Z"
modified: "2026-08-19T09:00:00.000Z"
completedAt: "2026-08-19T09:00:00.000Z"
labels: ["roadmap", "t1"]
order: "a1"
---
# T1.6b Org-configurable completion checklist

Franchise Settings CRUD for checklist items; `orgs` column migration; seed current labels as default.

---

## Board review 06-08-2026 — PREMATURE, candidate to drop

This adds an `orgs` column migration plus a Franchise Settings CRUD panel so each org can configure its own completion-checklist items.

**Nobody asked for it.** T1.6a already shipped the thing that mattered — the hardcoded TV-installer labels were made trade-neutral, so a plumber's checklist is no longer nonsense. This card is the *configurability* layer on top of a default that has never been shown to fail for a real user.

It is exactly the pattern `dd19` flags: config surface built ahead of demand, which then has to be tested, documented and supported forever. The review's position is that per-org configurability should require a named customer who would change it.

**Verdict: park until a customer asks.** Cheap to build later; the default costs nothing today.


---

## Closed 19-08-2026 — board reconciliation

Closed unbuilt. Verified 19-08-2026: `CHECKLIST` is still a hardcoded const at `src/components/CompletionChecklist.tsx:20`.

The trade-neutral default labels shipped with T1.6(a); per-org configurability is not happening. 06-08 board review: "PREMATURE, candidate to drop".
