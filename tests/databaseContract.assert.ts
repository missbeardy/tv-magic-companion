/**
 * Compile-time gate on the generated database contract. NOT a test file — the `.assert.ts`
 * suffix keeps it out of vitest's `tests/**\/*.test.ts` glob. It earns its keep through
 * `tsc --noEmit -p tsconfig.tests.json`, which `npm run typecheck` (and therefore `prebuild`)
 * already runs.
 *
 * Why it exists: migration 20260810000000 added `leads.last_follow_up_reminder_at`, but
 * src/types/database.types.ts was never regenerated. Nothing caught it, because the only code
 * writing that column goes through the untyped service-role client in api/_lib/supabaseAdmin.ts.
 *
 * Honest limit: this proves the generated types match what the follow-up code needs. It does NOT
 * prove they match production — prod was stood up by production_cutover.sql, not migrations
 * (docs/PROJECT.md:44), so schema-vs-prod drift still needs a manual check.
 */
import type { Database } from '../src/types/database.types'

type Assert<T extends true> = T
type Has<T, K extends PropertyKey> = K extends keyof T ? true : false

type LeadRow = Database['public']['Tables']['leads']['Row']
type LeadInsert = Database['public']['Tables']['leads']['Insert']
type LeadUpdate = Database['public']['Tables']['leads']['Update']

// The 6-hour reminder cooldown reads this column; the cron stamps it before notifying.
export type _stampInRow = Assert<Has<LeadRow, 'last_follow_up_reminder_at'>>
export type _stampInInsert = Assert<Has<LeadInsert, 'last_follow_up_reminder_at'>>
export type _stampInUpdate = Assert<Has<LeadUpdate, 'last_follow_up_reminder_at'>>

// Columns the follow-up sweep selects and filters on.
export type _attemptedAt = Assert<Has<LeadRow, 'last_contact_attempted_at'>>
export type _attemptRound = Assert<Has<LeadRow, 'contact_attempt_round'>>
export type _softDelete = Assert<Has<LeadRow, 'deleted_at'>>

// Weekly leaderboard: the page writes these through the typed client, so a missing
// column here means a broken save, not a silent no-op like the follow-up case above.
type LeaderboardRow = Database['public']['Tables']['weekly_leaderboard_entries']['Row']
type LeaderboardInsert = Database['public']['Tables']['weekly_leaderboard_entries']['Insert']

export type _leaderboardWeek = Assert<Has<LeaderboardRow, 'week_start'>>
export type _leaderboardJobs = Assert<Has<LeaderboardRow, 'jobs_completed'>>
export type _leaderboardSales = Assert<Has<LeaderboardRow, 'sales_amount'>>
export type _leaderboardTech = Assert<Has<LeaderboardRow, 'technician_id'>>
export type _leaderboardUpsertAudit = Assert<Has<LeaderboardInsert, 'updated_by'>>

type ProfileRow = Database['public']['Tables']['profiles']['Row']
type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

// v1.1.181 / migration 20260819140000. reconcileSubscription() reads this to decide whether a
// user has explicitly opted out of push; enablePush()/disablePush() write it. push_enabled
// could not express "never asked" (boolean, default false), which made every unasked user look
// like a refusal and blocked the OneSignal migration for six of eight TV Magic techs.
export type _pushDisabledInRow = Assert<Has<ProfileRow, 'push_disabled_at'>>
export type _pushDisabledInUpdate = Assert<Has<ProfileUpdate, 'push_disabled_at'>>

// v1.1.182 / migration 20260820120000. Every roster read filters on this, and the platform
// admin panel writes it, so a missing column here is a broken exclusion rather than a no-op.
export type _departedInRow = Assert<Has<ProfileRow, 'departed_at'>>
export type _departedInUpdate = Assert<Has<ProfileUpdate, 'departed_at'>>
