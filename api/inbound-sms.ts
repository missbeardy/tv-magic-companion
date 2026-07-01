// api/inbound-sms.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'
import { notifyManagersNewLead } from './_lib/notifyManagersNewLead.js'
import {
  insertRawFirstLead,
  updateLeadFromExtraction,
} from './_lib/rawFirstLead.js'
import { resolveOrgIdFromDid } from './_lib/resolveOrgFromDid.js'

const requests = new Map<string, { count: number; reset: number }>()

function checkRateLimit(ip: string, limit = 60, windowMs = 60000): boolean {
  const now = Date.now()
  const key = ip.split(',')[0].trim() || 'unknown'
  const entry = requests.get(key)
  if (!entry || now > entry.reset) {
    requests.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function verifyTwilioSignature(req: VercelRequest, authToken: string): boolean {
  const twilioSig = req.headers['x-twilio-signature'] as string
  if (!twilioSig) return false
  const url = `https://${req.headers.host}${req.url}`
  const params = req.body as Record<string, string>
  const sortedParams = Object.keys(params).sort().map(k => k + params[k]).join('')
  const signatureBase = url + sortedParams
  const expectedSig = createHmac('sha1', authToken).update(signatureBase).digest('base64')
  try {
    return timingSafeEqual(Buffer.from(twilioSig), Buffer.from(expectedSig))
  } catch {
    return false
  }
}

async function parseSmsWithClaude(smsText: string, fromNumber: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const prompt = `Extract customer details from this SMS. Return ONLY valid JSON.
SMS:
${smsText.substring(0, 1500)}

Fields:
- customer_name (string)
- phone (string) – if missing, use ${fromNumber}
- email (string or empty)
- service_type (one of: "TV Aerial","Satellite Dish","CCTV","Home Automation","Other")
- job_details (string, summary)
- address (string, combine Address, Suburb, State, Postcode)

Return: {"customer_name":"...","phone":"...","email":"...","service_type":"...","job_details":"...","address":"..."}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',  // updated model name
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) return null
    const data = await response.json() as { content?: Array<{ text?: string }> }
    const raw = data.content?.[0]?.text || ''
    const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim()
    return JSON.parse(cleaned)
  } catch (err) {
    console.error('Claude error:', err)
    return null
  }
}

function fallbackParse(smsText: string, fromNumber: string): any {
  const result = {
    customer_name: 'SMS Enquiry',
    phone: fromNumber,
    email: '',
    service_type: 'Other',
    job_details: smsText.substring(0, 200),
    address: ''
  }
  const nameMatch = smsText.match(/Your Name:\s*(.+?)(?:\n|$)/i)
  if (nameMatch) result.customer_name = nameMatch[1].trim()
  const phoneMatch = smsText.match(/Contact Phone:\s*(.+?)(?:\n|$)/i)
  if (phoneMatch) result.phone = phoneMatch[1].trim()
  const emailMatch = smsText.match(/Your Email:\s*(.+?)(?:\n|$)/i)
  if (emailMatch) result.email = emailMatch[1].trim()
  const addressMatch = smsText.match(/Address:\s*(.+?)(?:\n|$)/i)
  const suburbMatch = smsText.match(/Suburb:\s*(.+?)(?:\n|$)/i)
  const stateMatch = smsText.match(/State:\s*(.+?)(?:\n|$)/i)
  const postcodeMatch = smsText.match(/Postcode:\s*(.+?)(?:\n|$)/i)
  const addrParts = [addressMatch?.[1], suburbMatch?.[1], stateMatch?.[1], postcodeMatch?.[1]].filter(Boolean)
  if (addrParts.length) result.address = addrParts.join(', ')
  const subjectMatch = smsText.match(/Subject:\s*(.+?)(?:\n|$)/i)
  const messageMatch = smsText.match(/Message:\s*(.+?)(?:\n|$)/is)
  const fullText = [subjectMatch?.[1], messageMatch?.[1]].filter(Boolean).join(' ')
  if (fullText.toLowerCase().includes('aerial') || fullText.toLowerCase().includes('antenna')) result.service_type = 'TV Aerial'
  else if (fullText.toLowerCase().includes('satellite')) result.service_type = 'Satellite Dish'
  else if (fullText.toLowerCase().includes('cctv')) result.service_type = 'CCTV'
  result.job_details = fullText || smsText.substring(0, 200)
  return result
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : undefined

  if (action === 'meta-webhook') {
    const { handleMetaWebhook } = await import('./_lib/metaWebhook.js')
    return handleMetaWebhook(req, res, supabase)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown'
  if (!checkRateLimit(ip)) {
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('Missing TWILIO_AUTH_TOKEN')
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }

  if (!verifyTwilioSignature(req, authToken)) {
    console.warn('Invalid signature')
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }

  try {
    const body = req.body as Record<string, string>
    const smsText = body.Body || ''
    const fromNumber = body.From || ''
    const toNumber = body.To || ''

    if (!smsText.trim()) {
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    console.log(`SMS from ${fromNumber} to ${toNumber}`)

    const { orgId, source } = await resolveOrgIdFromDid(supabase, toNumber)

    if (!orgId) {
      console.error('No org_id – lead rejected')
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    const { isFeatureEnabledForOrg } = await import('./_lib/featureSwitches.js')
    const inboundEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_sms')
    if (!inboundEnabled) {
      console.log(`Inbound SMS disabled for org ${orgId}`)
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    let leadId: string
    try {
      const inserted = await insertRawFirstLead(supabase, orgId, {
        org_id: orgId,
        name: 'SMS Enquiry',
        phone: fromNumber,
        email: null,
        service_type: 'Other',
        details: smsText.substring(0, 500),
        address: null,
        source: 'sms',
        lead_source: 'SMS',
        raw_sms: JSON.stringify(body),
        created_at: new Date().toISOString(),
      })
      leadId = inserted.id
    } catch (insertErr) {
      console.error('SMS raw-first insert failed:', insertErr)
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    await supabase.from('lead_events').insert({
      lead_id: leadId,
      org_id: orgId,
      event_type: 'created',
      note: 'Lead captured from inbound SMS (raw-first)',
      payload: {
        source: 'sms',
        from: fromNumber,
      },
    })

    let parsed = await parseSmsWithClaude(smsText, fromNumber)
    if (!parsed) {
      console.log('Claude failed, using fallback')
      parsed = fallbackParse(smsText, fromNumber)
    }

    const leadName = `SMS Lead: ${parsed.customer_name}`

    try {
      await updateLeadFromExtraction(supabase, leadId, {
        name: leadName,
        phone: parsed.phone?.trim() || fromNumber,
        email: parsed.email?.trim() || undefined,
        service_type: parsed.service_type || 'Other',
        details: parsed.job_details || smsText.substring(0, 500),
        address: parsed.address?.trim() || undefined,
      })
    } catch (updateErr) {
      console.error('SMS lead extraction update failed:', updateErr)
    }

    const { data: savedLead } = await supabase
      .from('leads')
      .select('name, service_type, status')
      .eq('id', leadId)
      .single()

    try {
      await notifyManagersNewLead({
        id: leadId,
        org_id: orgId,
        name: savedLead?.name || leadName,
        service_type: savedLead?.service_type || parsed.service_type || 'Other',
        status: savedLead?.status || 'unassigned',
      })
    } catch (notifyErr) {
      console.error('Manager notification failed for inbound SMS:', notifyErr)
    }

    console.log(`Lead saved: ${leadId} with org ${orgId}`)

    const ackPhone = parsed.phone?.trim() || fromNumber
    if (ackPhone) {
      try {
        const { sendLeadAckSmsIfEnabled } = await import('./_lib/leadAckSms.js')
        await sendLeadAckSmsIfEnabled({
          orgId,
          leadId,
          toPhone: ackPhone,
          customerName: parsed.customer_name,
          source: 'sms',
        })
      } catch (ackErr) {
        console.error('Lead ack SMS failed for inbound SMS:', ackErr)
      }
    }

    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  } catch (err) {
    console.error('Unhandled error:', err)
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }
}