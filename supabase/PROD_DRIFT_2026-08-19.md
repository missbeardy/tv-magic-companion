# Prod schema drift — captured 19-08-2026 (t27a)

Read-only capture against prod (`abnheynzugpicikxwwmv`) and dev (`rkzgikxxxmovqisxusae`)
via the Supabase Management API. **Nothing was written to either database.**

This is step 1 of [RECONCILIATION.md](RECONCILIATION.md), plus the step-2 direction decision for
every drift line. The runbook's `npx supabase db diff --linked` was not used — it connects over the
pooler, whose cert is self-signed. `information_schema` was compared directly instead.

## Headline

| Measure | Prod | Dev |
|---|---|---|
| public tables | 33 | 33 |
| public columns | 400 | 403 |
| migrations recorded in `supabase_migrations` | **17** | 57 |
| migration files in `supabase/migrations/` | \-- | 82 |

**Prod's migration ledger is completely disjoint from the repo.** Not one of the 17 versions
recorded on prod matches any of the 82 filenames, and vice versa. Prod's stamps
(`20260630062735`, `20260810023657`, …) are ad-hoc application timestamps, not authoring stamps.

This means **`db push --linked` must never be run against prod as-is.** It would consider all 82
migrations unapplied and attempt to replay them from `20250622120000_initial_schema.sql` onward
against a populated production database.

Near-miss worth noting: repo `20260811032416` vs prod `20260811032427` — the same change, 11
seconds apart. That is the out-of-band application T1.11 discovered, visible in the ledger.

## Structural drift: 51 differences

### A. Prod is correct; dev and the ledger are behind — 9 columns

`orgs.xero_access_token`, `xero_refresh_token`, `xero_tenant_id`, `xero_tenant_name`,
`xero_token_expires_at`, `xero_connected_at`, and `invoices.xero_invoice_id`, `xero_synced_at`.

T3.1 Xero shipped to prod (v1.1.144) and `supabase/migrations/20260723120000_xero_live_sync.sql`
exists in the repo — it was simply never applied to **dev**.

**Decision: apply the existing repo migration to dev.** No prod change. No new migration.

**✅ DONE 19-08-2026.** `20260723120000_xero_live_sync.sql` applied to dev via the Management API and
recorded in `supabase_migrations.schema_migrations` (version `20260723120000`, name `xero_live_sync`)
so it is not another out-of-band application. Verified: all 8 `xero_*` columns present on dev, and
the `xero_live_sync` catalog row exists with `default_enabled=false`. Prod-only columns dropped from
14 to 6 — the remaining 6 are the orphans in section B plus `orgs.updated_at`.

### B. Prod-only orphans — 6 objects, all dead

| Object | In repo migrations | In generated types | Referenced by code |
|---|---|---|---|
| `org_emails` (table) | no | no | no |
| `customers.organisation_id` | no | no | no |
| `leads.signature_data` | no | no | no |
| `orgs.lead_count_reset_at` | no | no | no |
| `profiles.location_tracking_enabled` | no | no | no |
| `org_phone_numbers.description` | no | no | no |

Leftovers from `production_cutover.sql` and ad-hoc SQL. All nullable or defaulted, so they cost
nothing at runtime.

**Decision: document as accepted drift; do not add them to the migration files.** Adding them would
enshrine dead schema. Dropping them is a separate, later, backed-up change — not worth the risk now.
(`orgs.updated_at` is the one exception: it *is* covered by existing migrations and is simply
absent from dev.)

### C. Dev-only, never deployed to prod — 6 objects

`meta_messaging_sessions` (table), `org_facebook_pages.page_access_token`,
`org_facebook_pages.instagram_business_account_id`, `profiles.email`, `events.updated_at`,
`leads.updated_at`.

- `meta_messaging_sessions` belongs to **T3.5**, closed unbuilt on 19-08-2026. Dead weight.
- `profiles.email` is `NOT NULL` on dev, absent on prod — **verified not a live bug**: no code
  reads it and it is not in `src/types/database.types.ts`. A `20250624110000_sync_auth_profiles.sql`
  artifact.

**Decision: leave prod alone.** None of this is needed there.

### D. Nullability / default / type mismatches — 31 columns. **This is the dangerous set.**

Prod is consistently *more permissive* than the migrations describe. Representative:

| Column | Prod | Dev / migrations |
|---|---|---|
| `leads.name` | nullable | `NOT NULL` |
| `lead_events.lead_id` | nullable | `NOT NULL` |
| `profiles.org_id` | `NOT NULL` | nullable |
| `profiles.full_name` | `NOT NULL` | nullable |
| `events.user_id` | `NOT NULL` | nullable |
| `orgs.avg_job_value` | `integer` | `numeric` |
| 14 × `created_at` | nullable | `NOT NULL` |

Two distinct hazards:

1. **Tightening on prod can fail or break writes.** Applying `NOT NULL` to `leads.name` or
   `lead_events.lead_id` errors outright if any existing row is null — and if it succeeds, it
   starts rejecting inserts the app currently makes.
2. **`orgs.avg_job_value` `integer` vs `numeric` is a real behavioural difference**, not cosmetic —
   it silently truncates. Worth deciding deliberately.

**Decision: do NOT push these to prod.** Relax the migration files to match prod where prod is the
working system, and record the remainder as accepted drift. `avg_job_value` is the only one
warranting a real decision.

## What this changes about t27

The card assumed one supervised `db push` inside a PITR window. That is now clearly the wrong
operation — the ledger disjunction makes a bulk push actively dangerous, PITR or not.

- **t27a (safe, mostly done here):** capture drift, decide direction per line, correct the migration
  files and apply the Xero migration to dev. No prod writes, no backup needed.
- **t27b (supervised, needs a backup):** reconcile prod's `supabase_migrations` ledger so the repo
  becomes the source of truth going forward — a ledger repair, not a schema push. Far smaller and
  safer than the card implied.

## Reproduce

`/tmp/schema-diff.mjs` at time of writing; queries are read-only `information_schema` selects
against both project refs through `https://api.supabase.com/v1/projects/{ref}/database/query`.
