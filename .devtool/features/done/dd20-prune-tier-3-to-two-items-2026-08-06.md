---
id: "dd20-prune-tier-3-to-two-items-2026-08-06"
status: "done"
priority: "low"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-19T11:00:00.000Z"
completedAt: "2026-08-19T11:00:00.000Z"
labels: ["due-diligence", "subtraction", "roadmap", "governance"]
order: "ZF"
---

# DD20 Prune Tier 3 to two items

Tier 3 holds twelve items. Ten of them will never be built in their current form, and each costs a monthly ritual of re-reading and re-ranking. **A roadmap you cannot execute is a guilt tax.**

**Keep — with reasons:**
- **T3.2 Compliance certificates / forms.** Not a nice-to-have: it is a **market-eligibility gate**. Its absence excludes sparkies, plumbers and gasfitters from the addressable market entirely. Promote the moment a licensed trade is targeted.
- **T3.3 Recurring jobs.** Cheap, frequently asked, and present even in ServiceM8's free tier.

**Delete from the document** (record the reasoning here so they can be resurrected if a real customer asks):
- T3.4 Timesheets / job costing — team-market feature; the solo wedge doesn't need it.
- T3.5 Native Meta webhook — the Botpress/Make path works; this is dependency-removal, not customer value. (Existing card `t35` — close it.)
- T3.7 Supplier catalogs / POs — deliberately out of scope for solo service trades.
- T3.8 Live "on my way" tracking — on-the-way SMS already exists; this is polish.
- T3.9 MYOB CSV variant — build only if a real prospect asks.
- T3.10 Cross-device drafts — localStorage is fine at this scale.
- T3.11 Self-serve signup — only worth building with real inbound demand. (Existing card `t311` — close it.)
- T3.12 Card surcharge — documented fast-follow with no demand behind it. (Existing card `t312` — close it.)
- T3.6 Social posting — **executed DELETE** 11-08-2026 (v1.1.168). Card `t36` is in `done/`.

**T3.1 Xero live sync is already built** — and was built in violation of the T2.9 gate that explicitly said it stays Tier 3 under the front-door position. It shipped three days after that decision, unrequested and never UAT'd against a real Xero account. **Leave it in place, but log the governance failure**: this is the pattern the review identifies as the core risk — building because it is buildable, when the bottleneck is market contact.

**Spec:**
- Rewrite the Tier 3 section of `ROADMAP.md` down to two items.
- Move `t35`, `t311`, `t312` cards to `done/` or delete them, with a one-line "pruned 06-08-2026, reason:" note.
- Add the standing rule (already in DUE_DILIGENCE_REVIEW.md "Rules for now" #3): **no Tier 3 item may be promoted or built until `dd13` completes.**

**Done when:** Tier 3 lists two items; the pruned cards are closed with reasons; the freeze rule is in ROADMAP.md governance.

**Difficulty:** Easy — it is a decision, not a build.

Source: DUE_DILIGENCE_REVIEW.md — Phase 4, Phase 8 Remove item 26.


---

## Done 19-08-2026

Tier 3 deleted from `ROADMAP.md` entirely, not pruned to two.

The card wanted T3.2 (compliance certificates) and T3.3 (recurring jobs) kept, but the owner closed
both the same day — "no one has asked for this" — so nothing survived. Also closed that day: T3.5,
T3.11, T3.12. Deleted without a card: T3.4, T3.7, T3.8, T3.9, T3.10. T3.1 (Xero) and T3.6 (social,
removed by `dd18`) were already resolved and keep their Shipped-log rows.

The section is replaced by a short note recording why, so a future session does not reinstate the
list. Governance text updated with it: the Tier 3 freeze in the banner, in Governance rule 0, and in
the strategy anchor all referenced a tier that no longer exists.

Nothing is lost — closed items keep their cards in `.devtool/features/done/` and `git log` holds the
specs. A real customer request is now what starts one of these, not a paragraph written before
anyone asked.
