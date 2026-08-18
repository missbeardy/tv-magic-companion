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
