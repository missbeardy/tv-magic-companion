import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * How long in-app notifications are kept. They're transient nudges — the durable record of what
 * happened to a lead lives in `lead_events`, which is never purged.
 *
 * Added after the follow-up cron was found re-notifying the same leads every 15 minutes since
 * 07-07-2026, leaving 32,208 rows in prod with no retention policy of any kind.
 */
export const NOTIFICATION_RETENTION_DAYS = 30

/** Cron sweep step — runs in the existing consolidated chain, not a new endpoint. */
export async function purgeOldNotifications(
  supabase: SupabaseClient,
  retentionDays = NOTIFICATION_RETENTION_DAYS
): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('notifications')
    .delete()
    .lt('created_at', cutoff)
    .select('id')

  if (error) {
    console.error('[NOTIFICATION_PURGE_FAILED]', error.message)
    throw error
  }

  return { deleted: data?.length ?? 0 }
}
