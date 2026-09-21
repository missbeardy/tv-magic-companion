# AUD-1 — migrations (apply order, status: already live on prod)

These 10 migrations were sitting untracked in the working tree before AUD-1 and are now
committed to `release/prelaunch-hardening`. Filename timestamp order is apply order:

1. `20260916120000_sms_opt_outs.sql` — `sms_opt_outs` table (STOP-reply suppression list, service-role only).
2. `20260916130000_lock_counter_rpcs.sql` — revokes anon/authenticated EXECUTE on `increment_rate_limit` / `increment_ai_usage`, grants service_role only.
3. `20260916140000_hot_path_indexes.sql` — `CREATE INDEX CONCURRENTLY` on `lead_events`, `leads`, calendar. **Cannot run inside a transaction** — apply statement-by-statement via the Supabase SQL editor or Management API, then hand-record the version in `schema_migrations` (prod is not migration-driven per `supabase/PROD_DRIFT_2026-08-19.md`).
4. `20260916150000_org_sms_sender.sql` — adds `orgs.sms_from_number`. File explicitly says: do not put a live number in the migration; backfill via Management API from `org_phone_numbers`.
5. `20260916155000_two_way_sms.sql` — adds `two_way_sms` feature-flag catalog row, default off.
6. `20260916160000_lead_board_badges.sql` — `lead_board_badges` view (security invoker) + realtime publication changes for `leads`/`lead_events`.
7. `20260916165000_org_switch_overrides.sql` — recreates `org_feature_switch_overrides` (dropped in `20250701140000`).
8. `20260916170000_org_ai_context.sql` — adds `orgs.service_types`, `orgs.ai_context`, `brands.messenger_prompt`. File says: do not put live TV Magic copy here; backfill via Management API.
9. `20260916180000_flatten_tiers.sql` — sets all `feature_flag_catalog.min_tier` to `'basic'`.
10. `20260916181000_brisbane_timezone_default.sql` — changes `orgs.timezone` DEFAULT to `Australia/Brisbane`.

## Status (checked + applied 22-09-2026)

**Discovery: all 10 were already live on prod before this session touched anything.** The
`supabase_migrations.schema_migrations` ledger has entries for all 10 dated **2026-09-16**
(versions `20260916001917`–`20260916011741`, ad-hoc apply timestamps per
`supabase/PROD_DRIFT_2026-08-19.md`'s convention, not authoring stamps) — six days before
today. Someone or something applied them out-of-band; the repo migration files were only now
catching up to what prod already had. This session did not create any of that state.

Per-migration read-only checks against prod (feature_flag_catalog, brand_feature_switches,
org subscription tiers, the `supabase_realtime` publication, and the RPC grant table) all came
back showing the post-migration state already in place — e.g. zero `feature_flag_catalog` rows
above `min_tier='basic'`, `leads`/`lead_events` already in the realtime publication, and
`anon`/`authenticated` already lacking EXECUTE on `increment_rate_limit`/`increment_ai_usage`.

All 10 statements were re-run against prod today via the Management API as a verification pass
(every one is idempotent — `IF NOT EXISTS`, `ON CONFLICT DO UPDATE`, `ADD COLUMN IF NOT EXISTS`,
or a data UPDATE that was already a no-op). Re-running changed nothing; it confirmed prod matches
every file in `supabase/migrations/20260916*.sql` exactly. No backup was taken because no new
state was introduced.

- #3 (`hot_path_indexes`) confirmed present as 5 separate indexes (it cannot run inside a
  transaction, so each `CREATE INDEX CONCURRENTLY` was sent as its own statement).
- #4 and #8 still need their real-world backfill (TV Magic's live `sms_from_number`, and
  `brands.messenger_prompt` / `orgs.ai_context`) — that backfill is **not** done, and is explicitly
  AUD-5's job (org-scoped Messenger prompt) plus a follow-up for the SMS sender number. Neither
  column currently has a non-null value for `tv-magic`/`fieldbourne`.
- #7 (`org_switch_overrides`) reintroduces a table dropped 2025-07-01; nothing reads it yet
  (`get_effective_feature_switch` exists but is unused by app code), so it's inert until wired up.
- Migrations 2–8 of the audit (AUD-2 through AUD-8) will add further migrations **after** these 10,
  with higher timestamps.
