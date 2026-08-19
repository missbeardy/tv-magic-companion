---
id: "dd2-vercel-pro-and-supabase-pro-with-pitr-2026-08-06"
status: "done"
priority: "critical"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-19T09:00:00.000Z"
completedAt: "2026-08-19T09:00:00.000Z"
labels: ["due-diligence", "infrastructure", "legal", "ops"]
order: "Z1"
---

> **Blocked on owner, 06-08-2026:** this is a real-money decision (~US$45/mo across two vendor
> accounts) — I can't create paid Vercel/Supabase plans on your behalf. Skipping to `dd4` (pure
> engineering) and coming back to this once you've actioned the upgrades. Ping me after and I'll
> do the "then" follow-up (`api/send-sms.ts` decomposition) once the function cap is actually lifted.

# DD2 Vercel Pro and Supabase Pro with PITR

**A ~US$45/mo credit-card decision that has been deferred into an architectural constraint and a legal breach.**

## Vercel Hobby → Pro (~US$20/mo)

Three compounding harms today:

1. **Legal.** Vercel Hobby **prohibits commercial use**. If the client pays, you are in breach right now, and Vercel can pull your only customer's production system with no notice.
2. **Design.** The 12-function cap produced `api/send-sms.ts` — 39 KB dispatching 4 public quote/invoice endpoints, a cron sweep chain, 2 push endpoints and 6 authenticated actions (`api/send-sms.ts:747-816`). Public unauthenticated handlers sit *above* the auth gate in the same file. This is the shape that eventually produces an auth bypass. PROJECT.md has had to hard-code "Never add a new file under `api/` root."
3. **Blast radius.** One module-scope throw takes down quotes, invoices, push, cron and notifications simultaneously — PROJECT.md already documents this exact failure mode with extensionless imports.

## Supabase Free → Pro + PITR (~US$25/mo)

Production was stood up by cutover script, not migrations. `supabase/migrations/` is **not** a faithful description of prod, timestamp prefixes mix 2025/2026 out of authoring order, and T1.11 found a migration applied out-of-band and untracked in `supabase_migrations`. The prod reconciliation (existing card `t27`) is blocked on having a PITR window to work in.

**Open question flagged in the review: is PITR on right now?** If not, this is the most urgent line in the whole document.

**Spec:**
- Upgrade Vercel to Pro; confirm the function cap is lifted.
- Upgrade Supabase to Pro; enable PITR; verify a restore point exists.
- Record both as fixed costs in `docs/BUSINESS.md` cost base.
- **Then** (separate work, not this card): decompose `api/send-sms.ts` — split public endpoints, cron, and push into their own functions with clean trust boundaries.

**Feature switch:** none.

**Done when:** both accounts are on paid plans, PITR is confirmed enabled with a restore point, and the "never add a file under api/" rule is deleted from `docs/PROJECT.md`. Unblocks `t27`.

**Difficulty:** Easy (the upgrade). Medium (the hub decomposition that follows).

Source: DUE_DILIGENCE_REVIEW.md — Phase 2, C4 + C5.


---

## Closed 19-08-2026 — board reconciliation

Owner decision: not proceeding with the paid plans. The Vercel Hobby commercial-use position and the 12-function cap are **accepted, not resolved** — the `api/` hub pattern and the "never add a file under api/" rule in `docs/PROJECT.md` stay permanent, not temporary.

Knock-on: `t27` loses the PITR window it was waiting for. That card is re-scoped rather than closed — its read-only half (capture drift, correct the migration files, dry-run on dev) needs no backup and remains doable.
