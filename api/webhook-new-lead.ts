import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 1. Security Check: Ensure the request actually came from your Supabase project
  const webhookSecret = req.headers['x-supabase-webhook-secret']
  if (webhookSecret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Supabase sends the inserted row inside the `record` object
    const newLead = req.body.record

    // If it's not unassigned, we don't need to alert managers
    if (newLead.status !== 'unassigned') {
      return res.status(200).json({ skipped: true, reason: 'Lead is already assigned' })
    }

    // 2. Fetch all managers for this organization
    const { data: managers } = await supabase
      .from('profiles')
      .select('id, phone')
      .eq('org_id', newLead.org_id)
      .eq('role', 'manager')

    if (!managers || managers.length === 0) {
      return res.status(200).json({ skipped: true, reason: 'No managers found for org' })
    }

    // 3. Trigger In-App Notifications (Updates the Bell)
    const notifications = managers.map(m => ({
      user_id: m.id,
      title: 'New Unassigned Lead',
      message: `${newLead.name || 'Unknown'} needs assigning (${newLead.service_type || 'General'}).`,
      type: 'new_lead',
      read: false,
      org_id: newLead.org_id,
      created_at: new Date().toISOString(),
    }))
    
    await supabase.from('notifications').insert(notifications)

    // 4. Trigger SMS via Twilio using your existing credentials
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_FROM_NUMBER
    const credentials = Buffer.from(`${sid}:${token}`).toString('base64')

    for (const manager of managers) {
      if (!manager.phone) continue;

      const message = `TVMagic Alert: New Unassigned Lead added — ${newLead.name || 'Unknown'} (${newLead.service_type || 'General'}). Log in to assign: https://tv-magic-companion.vercel.app/leads`
      const bodyParams = new URLSearchParams({ To: manager.phone, From: from!, Body: message })

      try {
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: bodyParams.toString(),
        })
      } catch (err) {
        console.error(`Failed to send SMS to ${manager.phone}:`, err)
      }
    }

    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('Webhook processing error:', err)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}