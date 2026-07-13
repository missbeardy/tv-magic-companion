import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseAdmin } from './supabaseAdmin.js'

export async function handleSetTestProfile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseAdmin = getSupabaseAdmin()
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const authHeader = req.headers['authorization']
  const accessToken = typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : ''
  if (!accessToken) {
    return res.status(401).json({ error: 'Missing authorization token' })
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken)
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }

  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !callerProfile || callerProfile.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Platform admin only' })
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
      test_profile_owner_id: hidden ? userData.user.id : null,
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
