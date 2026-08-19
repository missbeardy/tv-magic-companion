---
id: "t3-12-card-surcharge-2026-07-24"
status: "done"
priority: "low"
assignee: null
dueDate: "2026-07-24"
created: "2026-07-24T12:00:00.000Z"
modified: "2026-08-19T09:00:00.000Z"
completedAt: "2026-08-19T09:00:00.000Z"
labels: ["roadmap", "t3"]
order: "a3"
---
# T3.12 Card surcharge option

`card_surcharge_percent` capped at cost of acceptance (AU rules).

---

## Board review 06-08-2026 — PREMATURE, recommend close

A documented fast-follow from the Pay Now work with no demand behind it. No customer has asked to pass card fees on, and with one org you would be building AU surcharge-cap compliance logic for a hypothetical.

**Verdict: close it.** Listed in `dd20` as a Tier 3 prune. Genuinely easy to add later — `card_surcharge_percent` on the invoice total — so there is no cost to deferring.


---

## Closed 19-08-2026 — board reconciliation

Closed unbuilt. Verified 19-08-2026: no `surcharge` reference anywhere in `src/`, `api/` or `shared/`.

The 06-08 board review said "PREMATURE, recommend close"; that decision is now taken.
