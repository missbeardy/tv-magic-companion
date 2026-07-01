import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { runContactFollowUpCron } from '../_lib/runContactFollowUpCron.js'
import { loadLocalEnvIfNeeded } from '../_lib/loadLocalEnv.js'

function isAuthorized(req: VercelRequest): boolean {
  loadLocalEnvIfNeeded()
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV !== 'production'

  const authHeader = req.headers.authorization
  if (typeof authHeader === 'string' && authHeader === `Bearer ${secret}`) return true

  const cronHeader = req.headers['x-cron-secret']
  const headerVal = Array.isArray(cronHeader) ? cronHeader[0] : cronHeader
  return headerVal === secret
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ error: 'Server not configured' })
  }

  try {
    const result = await runContactFollowUpCron(supabase)
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    console.error('contact-follow-up cron failed:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Cron failed',
    })
  }
}
