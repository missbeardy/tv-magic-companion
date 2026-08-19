---
id: "t2-7-prod-schema-reconcile-2026-07-24"
status: "backlog"
priority: "medium"
assignee: null
dueDate: "2026-07-24"
created: "2026-07-24T12:00:00.000Z"
modified: "2026-08-19T10:00:00.000Z"
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

---

## Re-scoped 19-08-2026 — drift captured, card split

`dd2` was closed (no Supabase Pro, no PITR), so this card was reassessed rather than left blocked.
Full evidence: [supabase/PROD_DRIFT_2026-08-19.md](../../supabase/PROD_DRIFT_2026-08-19.md).

**The original plan was wrong, independent of PITR.** Prod's `supabase_migrations` ledger records 17
versions, **none** of which match any of the 82 repo filenames. A `db push --linked` would treat all
82 as unapplied and replay them from `initial_schema.sql` against a populated production database.
That is not a PITR-protected operation, it is an operation not to perform.

Structural drift is 51 differences, and it is smaller and duller than feared:

- **9 columns** — prod is right, **dev** never got `20260723120000_xero_live_sync.sql`. Apply to dev.
- **6 prod-only orphans** (`org_emails`, `customers.organisation_id`, `leads.signature_data`,
  `orgs.lead_count_reset_at`, `profiles.location_tracking_enabled`, `org_phone_numbers.description`)
  — in no migration, no generated type, no code. Accepted drift; do not enshrine in migrations.
- **6 dev-only objects** never deployed to prod, incl. `meta_messaging_sessions` (T3.5, closed
  unbuilt) and `profiles.email` (verified unused — not a live bug).
- **31 nullability/default mismatches** where prod is more permissive. Tightening these on prod is
  the genuinely destructive move. Relax the migration files instead. `orgs.avg_job_value` is
  `integer` on prod vs `numeric` in migrations — the only one needing a real decision.

### Split

- **t27a — safe, no backup required.** Correct the migration files to match prod where prod is
  right; apply the Xero migration to dev. Drift capture is done.
- **t27b — supervised, take a dump first.** Repair prod's `supabase_migrations` ledger so the repo
  becomes the source of truth. A ledger repair, not a schema push — much smaller than this card
  originally assumed, and reachable without Supabase Pro.

### t27a status — DONE 19-08-2026

- Drift captured and classified per line ([supabase/PROD_DRIFT_2026-08-19.md](../../supabase/PROD_DRIFT_2026-08-19.md))
- `20260723120000_xero_live_sync.sql` applied to **dev** and recorded in dev's ledger
- Prod-only column drift: 14 -> 6, all remaining are dead orphans
- **No prod writes.**

Priority dropped critical -> medium: the dangerous operation (bulk `db push`) is now known to be the
wrong move, and the safe half is complete. What remains is t27b, a supervised ledger repair.

### t27b — what is left

1. `pg_dump` prod schema to a local file (the "backup" prerequisite; PITR not required for this).
2. Repair `supabase_migrations.schema_migrations` on prod so the 82 repo files are recorded as
   applied, making the repo the source of truth going forward.
3. Decide `orgs.avg_job_value`: `integer` on prod vs `numeric` in migrations — it truncates.
4. Relax the 31 nullability/default lines in the migration files to match prod. **Do not tighten prod.**
