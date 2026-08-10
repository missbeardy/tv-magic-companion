import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmployeeAlertToPhone } from './sendEmployeeAlert.js'

/**
 * "Delete my account" scope — the deletion matrix, verified against the live schema 07-08-2026.
 *
 * - The `profiles` row is **hard-deleted, not soft-deleted**. `profiles.id -> auth.users.id` is
 *   ON DELETE CASCADE, so `auth.admin.deleteUser` below removes the profile row outright. The
 *   scrub + `deleted_at` stamp that runs first is therefore belt-and-braces, not the main
 *   mechanism: it only matters in the failure case where the auth delete errors after the scrub
 *   succeeded, so no PII is left stranded. Don't "simplify" it away — that's its whole purpose.
 * - Organisational business records (leads, customers, quotes, invoices, lead_events, calendar
 *   events) are NOT deleted. Every staff foreign key on those tables is ON DELETE SET NULL, so
 *   the record survives and simply loses attribution. `events.user_id` was the one exception —
 *   it was CASCADE, so account deletion silently destroyed that technician's customer bookings.
 *   Fixed in `20260807000000_events_user_fk_set_null.sql`; if you add a new table referencing
 *   `profiles`, check its delete rule against that migration's reasoning.
 * - Still CASCADE by design: `notifications`, `push_subscriptions` (genuinely personal to the
 *   deleted user), and `tasks` (dead feature, slated for removal in dd18).
 * - Invoices in particular must be retained for ATO record-keeping — see the dd3 card.
 */
export async function deleteOwnAccount(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.avatar_url) {
    const path = `${userId}/avatar.${profile.avatar_url.split('.').pop()?.split('?')[0] ?? 'png'}`
    await supabase.storage.from('avatars').remove([path]).catch(() => {})
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: 'Deleted user',
      phone: null,
      suburb: null,
      avatar_url: null,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (profileError) {
    return { ok: false, error: profileError.message }
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(userId)
  if (authError) {
    console.error('Account deletion: profile scrubbed but auth user delete failed:', authError.message)
    return { ok: false, error: authError.message }
  }

  await supabase.from('account_deletion_requests').insert({
    email: 'self-service',
    org_hint: userId,
    note: 'In-app self-service deletion completed',
    status: 'completed',
    processed_at: new Date().toISOString(),
  })

  return { ok: true }
}

export interface AccountDeletionRequestInput {
  email: string
  orgHint?: string
  note?: string
}

/** Public (unauthenticated) request path — queued for manual processing, never instant. */
export async function requestAccountDeletion(
  supabase: SupabaseClient,
  input: AccountDeletionRequestInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('account_deletion_requests').insert({
    email: input.email.trim(),
    org_hint: input.orgHint?.trim() || null,
    note: input.note?.trim() || null,
    status: 'pending',
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  const alertPhone = process.env.PLATFORM_ALERT_PHONE?.trim()
  if (alertPhone) {
    const smsBody = `Account deletion request from ${input.email.trim()}. Check account_deletion_requests.`
    try {
      await sendEmployeeAlertToPhone(alertPhone, smsBody, { body: smsBody })
    } catch (err) {
      console.error('[DELETION_REQUEST_ALERT_FAILED]', err instanceof Error ? err.message : String(err))
    }
  }

  return { ok: true }
}
