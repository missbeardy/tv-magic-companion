// api/inbound-sms.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import './_lib/loadLocalEnv.js'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { processInboundLead } from './_lib/processInboundLead.js'
import { insertRawFirstLead } from './_lib/rawFirstLead.js'
import { resolveOrgIdFromDid } from './_lib/resolveOrgFromDid.js'
import { computeTwilioSignature } from './_lib/twilioSignature.js'

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

function webhookUrlFromRequest(req: VercelRequest): string {
  const host = req.headers.host
  if (!host || typeof host !== 'string') return ''
  const proto =
    host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  const path = (req.url ?? '/api/inbound-sms').split('?')[0]
  return `${proto}://${host}${path}`
}

function verifyTwilioSignature(req: VercelRequest, authToken: string): boolean {
  const twilioSig = req.headers['x-twilio-signature'] as string
  if (!twilioSig) return false
  const url = webhookUrlFromRequest(req)
  const params = req.body as Record<string, string>
  const expectedSig = computeTwilioSignature(url, params, authToken)
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

    let parsedForAck: { customer_name?: string; phone?: string; service_type?: string } = {}

    let leadId: string
    try {
      const result = await processInboundLead({
        supabase,
        orgId,
        insertLead: () =>
          insertRawFirstLead(supabase, orgId, {
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
          }),
        createdEvent: {
          note: 'Lead captured from inbound SMS (raw-first)',
          payload: { source: 'sms', from: fromNumber },
        },
        extract: async () => {
          let parsed = await parseSmsWithClaude(smsText, fromNumber)
          if (!parsed) {
            console.log('Claude failed, using fallback')
            parsed = fallbackParse(smsText, fromNumber)
          }
          parsedForAck = parsed
          return {
            updateFields: {
              name: `SMS Lead: ${parsed.customer_name}`,
              phone: parsed.phone?.trim() || fromNumber,
              email: parsed.email?.trim() || undefined,
              service_type: parsed.service_type || 'Other',
              details: parsed.job_details || smsText.substring(0, 500),
              address: parsed.address?.trim() || undefined,
            },
          }
        },
        buildNotify: ({ savedLead, extraction }) => ({
          name: savedLead?.name || extraction?.updateFields.name || 'SMS Enquiry',
          service_type: savedLead?.service_type || parsedForAck.service_type || 'Other',
          status: savedLead?.status || 'unassigned',
        }),
        followUp: {
          type: 'ack',
          source: 'sms',
          resolvePhone: () => parsedForAck.phone?.trim() || fromNumber,
          resolveCustomerName: () => parsedForAck.customer_name || 'there',
        },
        logLabel: 'inbound SMS',
      })
      leadId = result.leadId
    } catch (insertErr) {
      console.error('SMS raw-first insert failed:', insertErr)
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    console.log(`Lead saved: ${leadId} with org ${orgId}`)

    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  } catch (err) {
    console.error('Unhandled error:', err)
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }
}
