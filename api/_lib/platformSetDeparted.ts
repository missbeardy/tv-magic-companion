import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { requireRole } from './auth.js'

/**
 * Mark someone as having left, or reinstate them. Deliberately separate from
 * set-test-profile: hiding a test account scrubs it from history, departing someone keeps
 * their history and only stops them being given new work.
 */
export async function handleSetDeparted(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireRole(req, res, ['platform_admin'], 'Platform admin only')
  if (!caller) return

  const supabaseAdmin = getSupabaseAdmin()
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const { profileId, departed } = req.body as { profileId?: string; departed?: boolean }
  if (!profileId?.trim() || typeof departed !== 'boolean') {
    return res.status(400).json({ error: 'Missing profileId or departed flag' })
  }

  if (departed && profileId.trim() === caller.userId) {
    return res.status(400).json({ error: 'You cannot mark yourself as departed' })
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .eq('id', profileId.trim())
    .maybeSingle()

  if (targetError || !target) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ departed_at: departed ? new Date().toISOString() : null })
    .eq('id', target.id)

  if (updateError) {
    console.error('set-departed failed:', updateError.message)
    return res.status(500).json({ error: 'Failed to update profile' })
  }

  return res.status(200).json({
    success: true,
    profileId: target.id,
    departed,
    fullName: target.full_name,
  })
}
