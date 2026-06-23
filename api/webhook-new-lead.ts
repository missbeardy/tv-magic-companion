import type { VercelRequest, VercelResponse } from '@vercel/node'
import { notifyManagersNewLead } from './_lib/notifyManagersNewLead.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const webhookSecret = req.headers['x-supabase-webhook-secret']
  if (webhookSecret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const newLead = req.body.record as {
      id?: string
      org_id: string
      name?: string
      service_type?: string
      status: string
    }

    if (!newLead?.org_id) {
      return res.status(400).json({ error: 'Missing lead record' })
    }

    const result = await notifyManagersNewLead(newLead)
    if (result.skipped) {
      return res.status(200).json({ skipped: true, reason: result.skipped })
    }

    return res.status(200).json({ success: true, notified: result.notified })
  } catch (err) {
    console.error('Webhook processing error:', err)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}
