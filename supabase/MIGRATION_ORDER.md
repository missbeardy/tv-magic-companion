# Migration order hazard (T2.7)

## Problem

Prod was stood up via `production_cutover.sql`, not `supabase/migrations/`.
Additionally, some July-2026 migrations were stamped with `202507*` prefixes
(e.g. `20250714120000_fieldbourne_stage3_ack.sql`), so a lexicographic
`supabase db push` applies them **before** genuine June-2026 files such as
`20260625120000_missed_call_hookback.sql`.

## Policy (from 20-07-2026)

1. **Do not renumber historical files in place** — that breaks any environment
   that already recorded those filenames in `supabase_migrations.schema_migrations`.
2. **New migrations** must use real authoring-time stamps (`YYYYMMDDHHMMSS` in UTC).
3. Before any bulk `db push` to prod, follow [RECONCILIATION.md](RECONCILIATION.md):
   backup → `db diff --linked` → hand-written reconcile migration → dry-run on
   **dev** → supervised prod push.
4. `production_cutover.sql` is **historical** — do not use it for new environments.

## Suggested apply order for a greenfield (dev) rebuild

Apply in dependency order, not filename order. Groups:

1. Core schema + RLS (`20250622*`, `20250623*`, `20250624*`, `20250625*`)
2. Feature switches foundation (`20250701110000`, `20250701140000`, …)
3. Mid-2025-prefix feature packs that are actually mid-2026 authored
   (`20250704*` invoices … `20250714*` stage3 ack) — **only after** confirming
   their table dependencies already exist
4. `20260625*` missed-call / on-the-way
5. All `202607*` in filename order (including T2.1 / T2.4–T2.5 catalog inserts)

## Status

- [x] Hazard documented (this file)
- [x] `production_cutover.sql` marked historical
- [ ] Operator runs RECONCILIATION.md against prod (requires PITR + human review)
- [ ] `supabase db diff --linked` empty (or every remaining line documented)
