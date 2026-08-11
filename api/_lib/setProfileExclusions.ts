import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { normaliseKeywordList } from '../../shared/serviceExclusions.js'

/**
 * Set a team member's job exclusions (T1.14).
 *
 * Runs server-side with the service-role key because `profiles_update_self` RLS
 * restricts updates to `id = auth.uid()` — a manager cannot write a team member's
 * row from the client. Authorisation is therefore enforced here: the caller must be
 * a manager or platform admin, and the target profile must be in the caller's org.
 *
 * Routed as /api/create-user?action=set-exclusions (Hobby function cap is 12/12).
 */
export async function handleSetProfileExclusions(req: VercelRequest, res: VercelResponse) {
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

  const { data: callerProfile, error: callerError } = await supabaseAdmin
    .from('profiles')
    .select('role, org_id')
    .eq('id', userData.user.id)
    .single()

  if (callerError || !callerProfile) {
    return res.status(403).json({ error: 'Caller profile not found' })
  }

  if (!['manager', 'platform_admin'].includes(callerProfile.role)) {
    return res.status(403).json({ error: 'Only managers can set job exclusions' })
  }

  if (!callerProfile.org_id) {
    return res.status(403).json({ error: 'Caller has no organisation' })
  }

  // Gate the server path, not just the UI — the switch must actually stop the write.
  const enabled = await isFeatureEnabledForOrg(callerProfile.org_id, 'assignment_exclusions')
  if (!enabled) {
    return res.status(403).json({ error: 'Job exclusions are not enabled for this brand' })
  }

  const { profileId, keywords } = req.body as { profileId?: string; keywords?: unknown }
  if (!profileId?.trim()) {
    return res.status(400).json({ error: 'Missing profileId' })
  }
  if (!Array.isArray(keywords)) {
    return res.status(400).json({ error: 'keywords must be an array of strings' })
  }

  const cleaned = normaliseKeywordList(keywords)

  const { data: target, error: targetError } = await supabaseAdmin
    .from('profiles')
    .select('id, org_id, full_name')
    .eq('id', profileId.trim())
    .maybeSingle()

  if (targetError || !target) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  // The line that closes the cross-org hole: a manager may only edit their own team.
  // Platform admins are org-less and are allowed through.
  if (callerProfile.role !== 'platform_admin' && target.org_id !== callerProfile.org_id) {
    return res.status(403).json({ error: 'You can only edit team members in your own organisation' })
  }

  // Bump updated_at explicitly — nothing else does, and without it there is no way
  // to tell when an exclusion was set when diagnosing a routing decision after the
  // fact (this cost real time on 11-08-2026).
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ excluded_service_keywords: cleaned, updated_at: new Date().toISOString() })
    .eq('id', target.id)

  if (updateError) {
    console.error('set-exclusions failed:', updateError.message)
    return res.status(500).json({ error: 'Failed to update job exclusions' })
  }

  return res.status(200).json({
    success: true,
    profileId: target.id,
    fullName: target.full_name,
    keywords: cleaned,
  })
}
