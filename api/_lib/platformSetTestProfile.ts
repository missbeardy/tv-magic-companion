import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { requireRole } from './auth.js'

export async function handleSetTestProfile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireRole(req, res, ['platform_admin'], 'Platform admin only')
  if (!caller) return

  const supabaseAdmin = getSupabaseAdmin()
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const { profileId, hidden } = req.body as { profileId?: string; hidden?: boolean }
  if (!profileId?.trim() || typeof hidden !== 'boolean') {
    return res.status(400).json({ error: 'Missing profileId or hidden flag' })
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from('profiles')
    .select('id, org_id, full_name')
    .eq('id', profileId.trim())
    .maybeSingle()

  if (targetError || !target) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      is_hidden_test_profile: hidden,
      test_profile_owner_id: hidden ? caller.userId : null,
    })
    .eq('id', target.id)

  if (updateError) {
    console.error('set-test-profile failed:', updateError.message)
    return res.status(500).json({ error: 'Failed to update profile' })
  }

  return res.status(200).json({
    success: true,
    profileId: target.id,
    hidden,
    fullName: target.full_name,
  })
}
