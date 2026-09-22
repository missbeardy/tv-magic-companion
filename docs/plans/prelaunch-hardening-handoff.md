# Pre-launch hardening handoff (AUD-1 → AUD-8)

Branch: `release/prelaunch-hardening` (local only — nothing pushed, no PR opened).
Final gate: `npm run typecheck` clean, `npm test` 905/905, `npx vite build` clean
(see the note on `npm run build` below).

## Commits, in order

1. **`02ec838` AUD-1: baseline WIP** — committed the pre-existing untracked WIP
   (5 `api/_lib` files, `leadTransition.ts`/`leadsBoardQuery.ts`,
   `LeadSmsThread.tsx`, 8 tests, 10 migrations) plus 88 pre-existing modified/
   deleted tracked files that were sitting in the working tree. Excluded local
   tool-config directories (`.agents/`, `.claude/`, `.codex/`, `.cursor/`,
   `.impeccable/`, `.github/hooks/`, `skills-lock.json`) as not part of the
   app. All 10 pending migrations turned out to already be live on prod since
   2026-09-16 (six days before this session) — verified via the
   `schema_migrations` ledger and re-run as a no-op confirmation pass, not a
   real change.
2. **`607e6db` AUD-2: lock privileged orgs columns** — `BEFORE UPDATE` trigger
   blocking `authenticated`/`anon` writes to `subscription_tier`,
   `stripe_customer_id`, `stripe_connect_account_id`, `stripe_connect_status`,
   `brand_id`, `slug`, `sms_from_number` unless the caller is a platform
   admin. Uses `IS DISTINCT FROM` so `OrgSettingsPage`'s "reset to brand
   template" (which re-writes the org's own existing `brand_id`) still works.
3. **`9f4cedb` AUD-3: split FOR ALL RLS policies** — `leads`
   (SELECT/INSERT/UPDATE, no DELETE), `lead_events` (SELECT/INSERT only),
   `events` (UPDATE/DELETE require `user_id = auth.uid()` or
   manager/platform_admin). `tasks`/`task_items` were already dropped
   2026-08-11 — nothing to do there, card premise was stale.
4. **`21725b8` AUD-4: close the booking-confirm relay** —
   `handleBookingConfirm` now requires `leadId`, loads the lead via service
   role, 403s on org mismatch, and sources name/phone/email/address/service
   type from the lead row instead of the request body. Client payload
   trimmed to match. No prod SQL (pure app code).
5. **`19eccff` AUD-5: make the Messenger receptionist per-org** — system
   prompt now assembled from `orgs.messenger_business_name` /
   `messenger_contact_phone` / `service_area_note` / `ai_context` /
   `service_types` / `timezone` instead of a hardcoded TV Magic constant.
   Fails closed (skips the AI, logs to `unrouted_inbound`) when
   `messenger_contact_phone` is unset. **Note:** the native Messenger bot has
   never processed a real message in prod (`messenger_sessions` has 0 rows)
   — Botpress is what's actually live on the Page. This card was precautionary
   readiness work, not a live-behaviour fix.
6. **`dda0ab8` AUD-6: extend the profile lock trigger** — added
   `departed_at`, `excluded_service_keywords`, `is_hidden_test_profile`,
   `test_profile_owner_id`, `manager_id`, `email` to the existing
   `prevent_profile_privilege_escalation` trigger. **Caught before shipping:**
   `profiles.email` does not exist on prod — a plain column reference would
   have broken every profile update in prod the instant this trigger ran. The
   email check goes through `to_jsonb()` instead, which no-ops safely when
   the column is absent.
7. **`94e5960` AUD-7: npm audit fix** — react-router-dom 7.16.0→7.18.4, qs
   (transitive)→6.16.0, sharp 0.35.3→0.35.4, vite 8.0.12→8.3.0. All within
   existing semver ranges (`package.json` unchanged). 45→32 vulnerabilities;
   the rest need `--force` (major Vercel tooling bumps) and were left alone.
8. **`496d756` AUD-8: server env validation** — new `api/_lib/env.ts`
   (`missingServerEnv()`) checking `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `TWILIO_AUTH_TOKEN`, `INBOUND_SECRET`, `CRON_SECRET`, `META_APP_SECRET`,
   `RESEND_API_KEY`. `inbound-sms.ts`/`inbound-email.ts` no longer crash at
   module scope when env is missing (`createClient(...!)` → `getSupabaseAdmin()`
   with a controlled TwiML ack / 503 + Sentry capture). `withObservability`
   reports missing vars once per cold start. `cron-maintenance`'s heartbeat
   now includes `missingEnv`.

## Prod SQL files, in apply order

All in `docs/plans/prod-sql/`, each with a read-only verify query at the top.

1. **`AUD-1-pending-migrations.md`** — manifest of the 10 migrations that
   turned out to already be live (see commit 1 above). Nothing to apply;
   documents what's already there.
2. **`AUD-2.sql`** — `prevent_org_privileged_column_change` trigger.
   **Already live on prod** (found in the 22-09-2026 review), but as
   SECURITY DEFINER, which makes it a no-op — see AUD-C1.
3. **`AUD-3.sql`** — split RLS policies on `leads`/`lead_events`/`events`.
   **Already live on prod**, but overridden by 28 legacy permissive policies —
   see AUD-3b. Don't re-run after AUD-3b.
4. *(AUD-4 has no SQL — pure app code.)*
5. **`AUD-5.sql`** — `orgs.messenger_business_name` /
   `messenger_contact_phone` / `service_area_note` columns, widened
   `unrouted_inbound` constraints, and the TV Magic backfill. **Half-applied on
   prod**: columns + `messenger` channel exist, the `not_configured` reason
   does not. Run the part above the BACKFILL marker; hold the backfill.
6. **`AUD-6.sql`** — extended `prevent_profile_privilege_escalation`.
   **Already live on prod**, as a no-op for the same reason as AUD-2.
7. *(AUD-7 has no SQL — dependency bump.)*
8. *(AUD-8 has no SQL — pure app code.)*

### Review follow-ups (22-09-2026) — this is the real apply order

None of the 20260922* migrations are recorded in prod's `schema_migrations`.

1. **`AUD-C1.sql`** — apply **now**, before anything else and independent of
   the deploy. The four column-guard trigger functions were SECURITY DEFINER,
   so `current_user` was always `postgres` and they never blocked anything:
   any signed-in user can currently make themselves `platform_admin`. Flips
   them to SECURITY INVOKER (bodies unchanged). AUD-2.sql / AUD-6.sql and
   their migrations are now INVOKER too, so re-running them can't revert it.
2. **`AUD-5.sql`** — constraint part only (see above).
3. Deploy the branch (ships the `cancelBooking.ts` shared-booking guard).
4. **`AUD-3b.sql`** — drops the 28 legacy permissive policies (anon lead
   inserts, cross-org manager access, hard deletes, cross-org profiles, any
   employee editing org settings) behind a guard that aborts if a replacement
   policy is missing. Also lets a lead's assignee edit events on that lead so
   `leadContact.ts` / `leadAddress.ts` don't silently no-op.

## New env vars

None of these are *new* requirements — `missingServerEnv()` (AUD-8) just
makes the app aware of vars it already silently depended on:

| Var | Already required by |
|---|---|
| `SUPABASE_URL` (or `VITE_SUPABASE_URL`) | Every DB-touching handler |
| `SUPABASE_SERVICE_ROLE_KEY` | Every DB-touching handler |
| `TWILIO_AUTH_TOKEN` | `inbound-sms.ts` Twilio signature check |
| `INBOUND_SECRET` | `inbound-email.ts` CloudMailin basic-auth check |
| `CRON_SECRET` | All `cronActions.ts` handlers |
| `META_APP_SECRET` | Meta webhook HMAC verification |
| `RESEND_API_KEY` | `sendTransactionalEmail.ts` |

Check prod has all seven set (`cron-maintenance`'s heartbeat will now show
`missingEnv` on its next run either way).

## Known gaps carried forward, not part of this audit

- `npm run build`'s `prebuild` script fails on `WEEKLY_CHANGELOG.weekStarts`
  being stale (14-09-2026 vs this week's 21-09-2026) — pre-existing, unrelated
  to any AUD card, out of scope per the "no changelog entry" ground rule.
  Every gate in this handoff used `npx vite build` directly instead; the
  underlying bundle compiles clean.
- `profiles.email` and `orgs.stripe_subscription_id`/`subscription_expires_at`
  are schema drift/gaps noticed along the way but out of this audit's scope
  (see AUD-6 and AUD-2 reports above).
