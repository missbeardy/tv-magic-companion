---
id: "t2-7-prod-schema-reconcile-2026-07-24"
status: "backlog"
priority: "critical"
assignee: null
dueDate: "2026-07-24"
created: "2026-07-24T12:00:00.000Z"
modified: "2026-08-06T17:00:00.000Z"
completedAt: null
labels: ["roadmap", "ops"]
order: "a2"
---
# T2.7 Live prod schema reconcile (operator)

Owner-supervised `db diff` / `db push` against prod — requires PITR window. Docs already shipped.

---

## Board review 06-08-2026 — KEEP, priority raised low to critical

The review scores this as **Critical C5**. Production was stood up by a cutover script, not migrations; `supabase/migrations/` is not a faithful description of prod; timestamp prefixes mix 2025/2026 out of authoring order; and T1.11 found a migration applied out-of-band and untracked in `supabase_migrations`.

You cannot reproduce production. Blast radius today is one customer; at ten it is the business, and the first bad schema op is unrecoverable without PITR.

**Blocked by `dd2`** (Supabase Pro + PITR) — that is the window this card has been waiting for. Do `dd2`, then this, before customer #2.
