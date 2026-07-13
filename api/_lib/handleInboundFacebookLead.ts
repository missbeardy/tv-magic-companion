import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExtractionStatus } from './extractLead.js'
import { captureUnroutedInbound } from './captureUnroutedInbound.js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { formatAuPhoneForSms } from './phone.js'
import { processInboundLead } from './processInboundLead.js'
import {
  insertRawFirstLead,
  pickExtractedFields,
  type ExtractedLeadFields,
} from './rawFirstLead.js'
import { safeCompareSecret } from './timingSafeCompare.js'

export interface FacebookLeadBody {
  org: string
  name: string
  phone: string
  message: string
  city?: string | null
  email?: string | null
  website?: string | null
}

export type ParseFacebookLeadResult =
  | { ok: true; data: FacebookLeadBody }
  | { ok: false; error: string; status: 400 }

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Build lead details when the Botpress payload has no free-text message (Facebook Lead Form). */
export function buildFacebookLeadDetails(message: string, city: string | null): string {
  if (message) return message.slice(0, 500)
  if (city) return `Facebook lead form — ${city}`.slice(0, 500)
  return 'Facebook lead form enquiry'
}

/** Validate Botpress / Messenger web-form JSON body. */
export function parseFacebookLeadBody(body: unknown): ParseFacebookLeadResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object', status: 400 }
  }

  const record = body as Record<string, unknown>
  const website = trimString(record.website)
  if (website) {
    return { ok: false, error: 'Invalid submission', status: 400 }
  }

  const org = trimString(record.org)
  const name = trimString(record.name)
  const phone = trimString(record.phone)
  const message = trimString(record.message)
  const city = trimString(record.city) || null
  const email = trimString(record.email) || null

  if (!org) return { ok: false, error: 'org is required', status: 400 }
  if (!name) return { ok: false, error: 'name is required', status: 400 }
  if (!phone) return { ok: false, error: 'phone is required', status: 400 }

  return {
    ok: true,
    data: {
      org,
      name,
      phone,
      message: buildFacebookLeadDetails(message, city),
      city,
      email,
      website: null,
    },
  }
}

export function facebookLeadFallbackParse(
  name: string,
  phone: string,
  message: string,
  email: string | null,
  city?: string | null
): ExtractedLeadFields {
  const combined = message.toLowerCase()
  let service_type = 'General Enquiry'
  if (combined.includes('aerial') || combined.includes('antenna')) service_type = 'TV Aerial'
  else if (combined.includes('satellite')) service_type = 'Satellite Dish'
  else if (combined.includes('cctv')) service_type = 'CCTV'
  else if (combined.includes('automation')) service_type = 'Home Automation'

  const addressMatch = message.match(/(?:address|located at)[:\s]*(.+?)(?:\n|$)/i)
  const address = addressMatch?.[1]?.trim() ?? (city?.trim() || null)

  return pickExtractedFields({
    name,
    phone: formatAuPhoneForSms(phone),
    email,
    service_type,
    details: message.slice(0, 500),
    address,
  })
}

export async function extractFacebookLeadWithClaude(
  name: string,
  phone: string,
  message: string,
  email: string | null
): Promise<ExtractedLeadFields | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const prompt = `Extract lead information from this Facebook Messenger enquiry. Return ONLY a JSON object, no markdown.

Fields:
- name: full name (or null)
- phone: phone number (or null)
- email: email address (or null)
- service_type: one of "TV Aerial", "Satellite Dish", "CCTV", "Home Automation", "Other", "General Enquiry"
- details: brief summary (1-2 sentences)
- address: street address if mentioned (or null)

Known name: ${name}
Known phone: ${phone}
Known email: ${email ?? 'none'}
Message: ${message.slice(0, 1500)}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
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

  if (!res.ok) return null

  const result = (await res.json()) as { content: Array<{ type: string; text: string }> }
  const raw = result.content[0]?.type === 'text' ? result.content[0].text : ''
  const clean = raw.replace(/```json|```/g, '').trim()
  try {
    return pickExtractedFields(JSON.parse(clean) as ExtractedLeadFields)
  } catch {
    return null
  }
}

function verifyInboundSecret(req: VercelRequest): boolean {
  const header = req.headers['x-inbound-secret']
  const incoming =
    typeof header === 'string'
      ? header
      : Array.isArray(header)
        ? header[0]
        : undefined
  return safeCompareSecret(incoming, process.env.INBOUND_SECRET)
}

/** POST /api/inbound-facebook-lead — Botpress Studio → Messenger web form → lead. */
export async function handleInboundFacebookLead(
  req: VercelRequest,
  res: VercelResponse,
  supabase: SupabaseClient
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!verifyInboundSecret(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = parseFacebookLeadBody(req.body)
  if (!parsed.ok) {
    res.status(parsed.status).json({ error: parsed.error })
    return
  }

  const { org, name, phone, message, city, email: rawEmail } = parsed.data
  const email = rawEmail ?? null
  const normalizedPhone = formatAuPhoneForSms(phone)

  const { data: orgRow, error: orgError } = await supabase
    .from('orgs')
    .select('id')
    .eq('slug', org)
    .maybeSingle()

  if (orgError) {
    console.error('Facebook lead: org lookup failed', orgError.message)
    res.status(500).json({ error: 'Org lookup failed' })
    return
  }

  if (!orgRow?.id) {
    console.error(`Facebook lead: unknown org slug "${org}"`)
    await captureUnroutedInbound(supabase, {
      channel: 'facebook_lead',
      identifier: org,
      reason: 'no_mapping',
      payload: req.body,
    })
    res.status(200).json({ skipped: true, reason: 'unknown_org', org })
    return
  }

  const orgId = orgRow.id
  const messengerEnabled = await isFeatureEnabledForOrg(orgId, 'inbound_messenger')
  if (!messengerEnabled) {
    console.log(`Inbound Messenger disabled for org ${orgId}`)
    res.status(200).json({ skipped: true, reason: 'inbound_messenger_disabled' })
    return
  }

  let extractedForAck: ExtractedLeadFields = facebookLeadFallbackParse(
    name,
    normalizedPhone,
    message,
    email,
    city
  )

  try {
    const result = await processInboundLead({
      supabase,
      orgId,
      insertLead: () =>
        insertRawFirstLead(supabase, orgId, {
          org_id: orgId,
          name,
          phone: normalizedPhone,
          email,
          service_type: extractedForAck.service_type || 'General Enquiry',
          details: message.slice(0, 500),
          address: extractedForAck.address ?? null,
          source: 'facebook_messenger',
          lead_source: 'Facebook Messenger',
          raw_email: JSON.stringify(req.body),
        }),
      createdEvent: {
        note: 'Lead captured from Facebook Messenger via Botpress (raw-first)',
        payload: { source: 'facebook_messenger', org_slug: org },
      },
      extract: async () => {
        let extractionStatus: ExtractionStatus = 'fallback'
        const claudeExtracted = await extractFacebookLeadWithClaude(
          name,
          normalizedPhone,
          message,
          email
        )
        const extracted =
          claudeExtracted ??
          facebookLeadFallbackParse(name, normalizedPhone, message, email, city)
        extractionStatus = claudeExtracted ? 'succeeded' : 'fallback'
        extractedForAck = extracted
        return { updateFields: extracted, extractionStatus }
      },
      buildNotify: ({ savedLead, extraction }) => ({
        name: savedLead?.name || extraction?.updateFields.name || name,
        service_type:
          savedLead?.service_type || extraction?.updateFields.service_type || 'General Enquiry',
        status: savedLead?.status || 'unassigned',
      }),
      followUp: {
        type: 'ack',
        source: 'facebook_messenger',
        resolvePhone: () => extractedForAck.phone?.trim() || normalizedPhone,
        resolveCustomerName: () => extractedForAck.name?.trim() || name,
      },
      logLabel: 'inbound Facebook Messenger',
      run: {
        workflowKey: 'inbound_lead',
        triggerChannel: 'facebook_messenger',
        triggerSummary: { org_slug: org, source: 'facebook_messenger' },
      },
    })

    res.status(200).json({
      success: true,
      lead_id: result.leadId,
      ...(result.partial ? { partial: true } : {}),
    })
  } catch (err) {
    console.error('Facebook lead processing error:', err)
    res.status(500).json({ error: 'Lead processing failed' })
  }
}
