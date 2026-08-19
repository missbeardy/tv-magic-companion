---
id: "t3-5-native-messenger-bot-2026-07-24"
status: "done"
priority: "low"
assignee: null
dueDate: null
created: "2026-07-24T12:00:00.000Z"
modified: "2026-08-19T09:00:00.000Z"
completedAt: "2026-08-19T09:00:00.000Z"
labels: ["roadmap", "t3"]
order: "a4"
---
# T3.5 Native Meta Messenger webhook + hybrid bot

Finish `api/_lib/metaWebhook.ts`; remove Botpress/Make dependency. Botpress path remains supported until then.

---

## Board review 06-08-2026 — DEPENDENCY REMOVAL, NOT CUSTOMER VALUE

Finishing `api/_lib/metaWebhook.ts` removes the Botpress/Make dependency from the Facebook path. The Botpress path **works today**, and T1.11 shipped a second Make-based path for Lead Ads.

This buys a customer nothing. It buys *you* one fewer third party — real, but it also costs `leads_retrieval` Meta app review and per-org page-token management, which is a meaningful ongoing burden for a solo operator.

**Verdict: close it.** Listed in `dd20` as a Tier 3 prune. Revisit only if Botpress/Make actually becomes unreliable in production — and you will not know whether it has until `dd1` gives you the telemetry to see it.


---

## Closed 19-08-2026 — board reconciliation

Closed unbuilt. Verified 19-08-2026: `api/_lib/metaWebhook.ts:111` still carries `// TODO: conversation state, hybrid bot, lead insert (Step 9)` — the repo's only substantive TODO, now orphaned by design.

The Botpress/Make path remains the supported one. 06-08 board review: "DEPENDENCY REMOVAL, NOT CUSTOMER VALUE".
