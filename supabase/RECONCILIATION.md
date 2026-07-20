# Production schema reconciliation (deferred, supervised)

Production (`abnheynzugpicikxwwmv`) was never driven through the migration flow —
it was stood up via `supabase/production_cutover.sql` plus ad-hoc SQL. As a
result `supabase/migrations/` is **not** yet a faithful description of prod. This
runbook makes it one. It requires prod credentials and human review of every
drift line, so it is intentionally **not** automated and must be run with an
operator present.

## Prerequisites

- `SUPABASE_ACCESS_TOKEN` for an account with access to the prod project
- A maintenance / low-traffic window (index creation briefly locks writes)
- A fresh prod backup / PITR checkpoint before applying anything
- Read [MIGRATION_ORDER.md](MIGRATION_ORDER.md) first — lexicographic `db push` is **not** safe until the timestamp hazard is understood

## Steps

1. **Capture the drift.**
   ```bash
   npx supabase link --project-ref abnheynzugpicikxwwmv
   npx supabase db diff --linked > /tmp/prod-drift.sql
   ```
   `db diff` reports what the migration history would change on prod. Read
   **every** line — do not apply blind.

2. **Author one reconciliation migration.** Hand-write a single
   `supabase/migrations/<ts>_prod_reconcile.sql` that brings prod in line with
   the migration history (or, where prod is correct and the history is stale,
   adjust the history instead). Never paste `db diff` output verbatim.

3. **Dry-run on dev first.** Apply the full `supabase/migrations/` set to the dev
   project (`rkzgikxxxmovqisxusae`) via `supabase db push` and confirm the app
   still works end to end (RLS reads, indexes used, crons run).

4. **Apply to prod under supervision.**
   ```bash
   npx supabase db push --linked
   ```
   For `20260710140000_indexes_retention_rls.sql`, if any target table is large,
   run its `CREATE INDEX` statements as `CREATE INDEX CONCURRENTLY` manually
   (outside a transaction) instead of letting the migration create them inline.

5. **Adopt the linked flow.** From here on, `supabase db push` against the linked
   prod project is the only way schema changes reach production —
   `supabase/migrations/` becomes the single source of truth.

6. **Retire the cutover script.** Once reconciled, mark
   `supabase/production_cutover.sql` historical (move it aside or add a header
   noting it is superseded by the migration history).

## Not in scope for this file

`supabase/dev-seed/*` are dev-only and never applied to prod (see that folder's
README).
