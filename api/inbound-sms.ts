// api/inbound-sms.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'

// Simple in-memory rate limiter
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

// Enhanced parser: first try Claude, then regex fallback
async function parseSmsWithClaude(smsText: string, fromNumber: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const prompt = `Extract customer details from this SMS. Return ONLY valid JSON. No markdown.
SMS text:
"""
${smsText.substring(0, 1500)}
"""

Fields to extract:
- customer_name: the customer's full name (look for "Your Name:" or similar)
- phone: the customer's contact phone number (look for "Contact Phone:" or a phone number in the text; if not found, use the sender's number: ${fromNumber})
- email: email address if present
- service_type: infer from the job description (choose one: "TV Aerial", "Satellite Dish", "CCTV", "Home Automation", "Other")
- job_details: a concise summary of the work requested
- address: full address (combine Address, Suburb, State, Postcode if present)

Return JSON: {"customer_name":"...","phone":"...","email":"...","service_type":"...","job_details":"...","address":"..."}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
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
    console.error('Claude parse error:', err)
    return null
  }
}

// Fallback regex parser for structured SMS like "Your Name: ..."
function fallbackParse(smsText: string, fromNumber: string): any {
  const result = {
    customer_name: 'SMS Enquiry',
    phone: fromNumber,
    email: '',
    service_type: 'Other',
    job_details: smsText.substring(0, 200),
    address: ''
  }

  // Extract name
  const nameMatch = smsText.match(/Your Name:\s*(.+?)(?:\n|$)/i)
  if (nameMatch) result.customer_name = nameMatch[1].trim()

  // Extract phone
  const phoneMatch = smsText.match(/Contact Phone:\s*(.+?)(?:\n|$)/i)
  if (phoneMatch) result.phone = phoneMatch[1].trim()

  // Extract email
  const emailMatch = smsText.match(/Your Email:\s*(.+?)(?:\n|$)/i)
  if (emailMatch) result.email = emailMatch[1].trim()

  // Extract address components and combine
  const addressMatch = smsText.match(/Address:\s*(.+?)(?:\n|$)/i)
  const suburbMatch = smsText.match(/Suburb:\s*(.+?)(?:\n|$)/i)
  const stateMatch = smsText.match(/State:\s*(.+?)(?:\n|$)/i)
  const postcodeMatch = smsText.match(/Postcode:\s*(.+?)(?:\n|$)/i)
  const addrParts = [addressMatch?.[1], suburbMatch?.[1], stateMatch?.[1], postcodeMatch?.[1]].filter(Boolean)
  if (addrParts.length) result.address = addrParts.join(', ')

  // Extract subject/message for service type hint
  const subjectMatch = smsText.match(/Subject:\s*(.+?)(?:\n|$)/i)
  const messageMatch = smsText.match(/Message:\s*(.+?)(?:\n|$)/is)
  const fullText = [subjectMatch?.[1], messageMatch?.[1]].filter(Boolean).join(' ')
  if (fullText.toLowerCase().includes('aerial') || fullText.toLowerCase().includes('antenna')) result.service_type = 'TV Aerial'
  else if (fullText.toLowerCase().includes('satellite')) result.service_type = 'Satellite Dish'
  else if (fullText.toLowerCase().includes('cctv')) result.service_type = 'CCTV'
  else if (fullText.toLowerCase().includes('automation')) result.service_type = 'Home Automation'
  
  result.job_details = fullText || smsText.substring(0, 200)
  return result
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown'
  if (!checkRateLimit(ip)) {
    console.warn('Rate limit hit for', ip)
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
    console.warn('Invalid Twilio signature')
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }

  try {
    const body = req.body as Record<string, string>
    const smsText = body.Body || ''
    const fromNumber = body.From || ''
    const toNumber = body.To || ''

    if (!smsText.trim()) {
      console.log('Empty SMS')
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    console.log(`SMS from ${fromNumber} to ${toNumber}`)

    // Try Claude, then fallback regex
    let parsed = await parseSmsWithClaude(smsText, fromNumber)
    if (!parsed) {
      console.log('Claude failed, using fallback parser')
      parsed = fallbackParse(smsText, fromNumber)
    }

    // Determine org_id from the called number (To) with robust normalization
    let orgId: string | null = null
    if (toNumber) {
      // Normalize: remove all non-digits, then ensure +61 prefix
      let normalizedTo = toNumber.replace(/\D/g, '')
      if (normalizedTo.startsWith('61')) normalizedTo = '+' + normalizedTo
      else if (normalizedTo.startsWith('0')) normalizedTo = '+61' + normalizedTo.slice(1)
      else normalizedTo = '+' + normalizedTo
      
      console.log(`Looking up org for normalized number: ${normalizedTo}`)
      const { data: mapping, error: lookupError } = await supabase
        .from('org_phone_numbers')
        .select('org_id')
        .eq('phone_number', normalizedTo)
        .maybeSingle()
      
      if (lookupError) console.error('Lookup error:', lookupError)
      if (mapping) orgId = mapping.org_id
      console.log(`Lookup result: orgId = ${orgId}`)
    }

    // Fallback to DEFAULT_ORG_ID if still null
    if (!orgId && process.env.DEFAULT_ORG_ID) {
      orgId = process.env.DEFAULT_ORG_ID
      console.log(`Using DEFAULT_ORG_ID: ${orgId}`)
    }

    if (!orgId) {
      console.error('CRITICAL: No org_id could be resolved. Lead will be rejected.')
      res.setHeader('Content-Type', 'text/xml')
      return res.status(200).send('<Response></Response>')
    }

    // Insert lead
    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert({
        name: parsed.customer_name,
        phone: parsed.phone,
        email: parsed.email || null,
        service_type: parsed.service_type,
        details: parsed.job_details,
        address: parsed.address,
        status: 'unassigned',
        source: 'sms',
        org_id: orgId,
        raw_sms: JSON.stringify(body),
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
    } else {
      console.log(`Lead created: ${newLead.id} for org ${orgId}`)
    }

    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  } catch (err) {
    console.error('Unhandled error:', err)
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send('<Response></Response>')
  }
}