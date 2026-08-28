import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExtractionStatus } from './extractLead.js'
import { captureUnroutedInbound } from './captureUnroutedInbound.js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import {
  findDuplicateFacebookMessengerLead,
  parseConversationId,
} from './inboundLeadDedup.js'
import { formatAuPhoneForSms } from './phone.js'
import { processInboundLead } from './processInboundLead.js'
import {
  insertRawFirstLead,
  pickExtractedFields,
  type ExtractedLeadFields,
} from './rawFirstLead.js'
import { safeCompareSecret } from './timingSafeCompare.js'

const LEGACY_DETAILS_MAX = 500
const STRUCTURED_DETAILS_MAX = 1500

/** Messenger bot (Botpress) vs Facebook Lead Ads instant form (Make.com). */
export type FacebookLeadChannel = 'messenger' | 'lead_ads'

export interface FacebookLeadBody {
  org: string
  name: string
  phone: string
  message: string
  city?: string | null
  email?: string | null
  website?: string | null
  channel: FacebookLeadChannel
  form_name?: string | null
  /** Present only on the Gen-AI agent path. Omitted by the live structured bot. */
  conversation_id?: string | null
  suburb?: string | null
  service_needed?: string | null
  out_of_area: boolean
}

interface FacebookChannelConfig {
  featureKey: 'inbound_messenger' | 'inbound_facebook_ads'
  source: string
  leadSource: string
  createdNote: string
  logLabel: string
}

const FACEBOOK_CHANNELS: Record<FacebookLeadChannel, FacebookChannelConfig> = {
  messenger: {
    featureKey: 'inbound_messenger',
    source: 'facebook_messenger',
    leadSource: 'Facebook Messenger',
    createdNote: 'Lead captured from Facebook Messenger (raw-first)',
    logLabel: 'inbound Facebook Messenger',
  },
  lead_ads: {
    featureKey: 'inbound_facebook_ads',
    source: 'facebook_lead_ads',
    leadSource: 'Facebook Lead Ads',
    createdNote: 'Lead captured from a Facebook Lead Ads instant form (raw-first)',
    logLabel: 'inbound Facebook Lead Ads',
  },
}

export type ParseFacebookLeadResult =
  | { ok: true; data: FacebookLeadBody }
  | { ok: false; error: string; status: 400 }

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseOutOfArea(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    return v === 'true' || v === 'yes' || v === '1'
  }
  return false
}

const FACEBOOK_SERVICE_TYPES = [
  'TV Aerial',
  'Wall Mounting',
  'Starlink',
  'Reception Repair',
  'TV Points',
  'Home Theatre',
  'Satellite Dish',
  'CCTV',
  'MATV',
  'VAST TV',
  'Sound Bar',
  'Video Wall',
  'Electrical',
  'Home Automation',
  'Universal Remotes',
  'Other',
  'General Enquiry',
] as const

/** Keyword fallback when Claude extraction is unavailable. More specific phrases first. */
export function inferFacebookServiceType(text: string): string {
  const combined = text.toLowerCase()
  if (combined.includes('starlink')) return 'Starlink'
  if (combined.includes('video wall')) return 'Video Wall'
  if (/\b(wall\s*mount|hang(ing)? (the )?tv|mount the tv)\b/.test(combined)) return 'Wall Mounting'
  if (
    combined.includes('home theatre') ||
    combined.includes('home theater') ||
    combined.includes('home cinema') ||
    combined.includes('media room') ||
    /\bthx\b/.test(combined)
  ) {
    return 'Home Theatre'
  }
  if (combined.includes('sound bar') || combined.includes('soundbar')) return 'Sound Bar'
  if (combined.includes('tv point') || combined.includes('extra point') || combined.includes('tv outlet')) {
    return 'TV Points'
  }
  if (
    combined.includes('reception') ||
    combined.includes('pixelat') ||
    combined.includes('pixilat') ||
    combined.includes('no signal') ||
    combined.includes('missing channel')
  ) {
    return 'Reception Repair'
  }
  if (combined.includes('matv')) return 'MATV'
  if (combined.includes('cctv')) return 'CCTV'
  if (combined.includes('vast')) return 'VAST TV'
  if (combined.includes('satellite') || combined.includes('foxtel')) return 'Satellite Dish'
  if (combined.includes('aerial') || combined.includes('antenna')) return 'TV Aerial'
  if (combined.includes('electrical') || combined.includes('electrician')) return 'Electrical'
  if (combined.includes('automation')) return 'Home Automation'
  if (combined.includes('remote')) return 'Universal Remotes'
  return 'General Enquiry'
}

/**
 * Technician-readable card used only when the Gen-AI agent sends structured fields.
 * The live structured bot never sends these, so its details string stays unchanged.
 */
export function assembleMessengerLeadDetails(input: {
  name: string
  phone: string
  message: string
  suburb: string | null
  serviceNeeded: string | null
  outOfArea: boolean
}): string {
  const lines = [
    'Facebook Messenger — TV Magic South Brisbane',
    `Name: ${input.name}`,
    `Phone: ${input.phone}`,
    input.suburb ? `Suburb: ${input.suburb}` : null,
    input.serviceNeeded ? `Service: ${input.serviceNeeded}` : null,
    `Out of area: ${input.outOfArea ? 'yes' : 'no'}`,
    input.message ? `Notes: ${input.message}` : null,
  ]
  return lines.filter((line): line is string => Boolean(line)).join('\n').slice(0, STRUCTURED_DETAILS_MAX)
}

function shouldAssembleMessengerCard(body: {
  conversation_id: string | null
  suburb: string | null
  service_needed: string | null
  out_of_area: boolean
}): boolean {
  return Boolean(body.conversation_id || body.suburb || body.service_needed || body.out_of_area)
}

/**
 * Build lead details when the payload has no free-text message.
 * Lead Ads instant forms usually collect only name/phone/postcode, so the form
 * name is the only signal about what the customer actually responded to.
 */
export function buildFacebookLeadDetails(
  message: string,
  city: string | null,
  channel: FacebookLeadChannel = 'messenger',
  formName: string | null = null
): string {
  if (message) return message.slice(0, 500)

  if (channel === 'lead_ads') {
    const parts = [formName ? `"${formName}"` : null, city].filter(Boolean)
    const suffix = parts.length > 0 ? ` — ${parts.join(' — ')}` : ''
    return `Facebook Lead Ads enquiry${suffix}`.slice(0, 500)
  }

  if (city) return `Facebook lead form — ${city}`.slice(0, 500)
  return 'Facebook lead form enquiry'
}

/** Normalise the optional channel discriminator; anything unknown is rejected. */
function parseChannel(value: unknown): FacebookLeadChannel | null {
  const raw = trimString(value).toLowerCase()
  if (!raw) return 'messenger'
  if (raw === 'messenger' || raw === 'lead_ads') return raw
  return null
}

/** Validate Botpress (Messenger) or Make.com (Lead Ads) JSON body. */
export function parseFacebookLeadBody(body: unknown): ParseFacebookLeadResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object', status: 400 }
  }

  const record = body as Record<string, unknown>
  const website = trimString(record.website)
  if (website) {
    return { ok: false, error: 'Invalid submission', status: 400 }
  }

  const channel = parseChannel(record.channel)
  if (!channel) {
    return { ok: false, error: 'channel must be "messenger" or "lead_ads"', status: 400 }
  }

  const org = trimString(record.org)
  const name = trimString(record.name)
  const phone = trimString(record.phone)
  const rawMessage = trimString(record.message)
  const city = trimString(record.city) || null
  const email = trimString(record.email) || null
  const formName = trimString(record.form_name) || null
  const conversationId = parseConversationId(record.conversation_id)
  const suburb = trimString(record.suburb) || null
  const serviceNeeded = trimString(record.service_needed) || null
  const outOfArea = parseOutOfArea(record.out_of_area)

  if (!org) return { ok: false, error: 'org is required', status: 400 }
  if (!name) return { ok: false, error: 'name is required', status: 400 }
  if (!phone) return { ok: false, error: 'phone is required', status: 400 }

  const structured = {
    conversation_id: conversationId,
    suburb,
    service_needed: serviceNeeded,
    out_of_area: outOfArea,
  }
  const message = shouldAssembleMessengerCard(structured)
    ? assembleMessengerLeadDetails({
        name,
        phone,
        message: rawMessage,
        suburb: suburb || city,
        serviceNeeded,
        outOfArea,
      })
    : buildFacebookLeadDetails(rawMessage, city, channel, formName)

  return {
    ok: true,
    data: {
      org,
      name,
      phone,
      message,
      city,
      email,
      website: null,
      channel,
      form_name: formName,
      ...structured,
    },
  }
}

export function facebookLeadFallbackParse(
  name: string,
  phone: string,
  message: string,
  email: string | null,
  city?: string | null,
  suburb?: string | null,
  serviceNeeded?: string | null
): ExtractedLeadFields {
  const service_type = inferFacebookServiceType(`${serviceNeeded ?? ''} ${message}`)
  const addressMatch = message.match(/(?:address|located at|suburb)[:\s]*(.+?)(?:\n|$)/i)
  const address = suburb?.trim() || addressMatch?.[1]?.trim() || city?.trim() || null
  const detailsMax = suburb || serviceNeeded ? STRUCTURED_DETAILS_MAX : LEGACY_DETAILS_MAX

  return pickExtractedFields({
    name,
    phone: formatAuPhoneForSms(phone),
    email,
    service_type,
    details: message.slice(0, detailsMax),
    address,
  })
}

export async function extractFacebookLeadWithClaude(
  name: string,
  phone: string,
  message: string,
  email: string | null,
  channel: FacebookLeadChannel = 'messenger'
): Promise<ExtractedLeadFields | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const context =
    channel === 'lead_ads'
      ? `this Facebook Lead Ads instant-form submission. The message is assembled from form answers and the ad's form name, not free text — infer service_type from the form name where the customer wrote nothing, and do not invent details they did not provide`
      : 'this Facebook Messenger enquiry'

  const prompt = `Extract lead information from ${context}. Return ONLY a JSON object, no markdown.

Fields:
- name: full name (or null)
- phone: phone number (or null)
- email: email address (or null)
- service_type: one of ${FACEBOOK_SERVICE_TYPES.map((value) => `"${value}"`).join(', ')}
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

export type IngestFacebookLeadResult =
  | { success: true; lead_id: string; duplicate?: true; partial?: true }
  | { skipped: true; reason: string; org?: string }
  | { error: string; status: number }

/** Shared insert path for Botpress HTTP and the native Meta Messenger bot. */
export async function ingestParsedFacebookLead(
  supabase: SupabaseClient,
  data: FacebookLeadBody,
  rawPayload: unknown
): Promise<IngestFacebookLeadResult> {
  const {
    org,
    name,
    phone,
    message,
    city,
    email: rawEmail,
    channel,
    form_name: formName,
    conversation_id: conversationId,
    suburb,
    service_needed: serviceNeeded,
    out_of_area: outOfArea,
  } = data
  const email = rawEmail ?? null
  const normalizedPhone = formatAuPhoneForSms(phone)
  const config = FACEBOOK_CHANNELS[channel]
  const detailsMax =
    conversationId || suburb || serviceNeeded || outOfArea ? STRUCTURED_DETAILS_MAX : LEGACY_DETAILS_MAX

  const { data: orgRow, error: orgError } = await supabase
    .from('orgs')
    .select('id')
    .eq('slug', org)
    .maybeSingle()

  if (orgError) {
    console.error('Facebook lead: org lookup failed', orgError.message)
    return { error: 'Org lookup failed', status: 500 }
  }

  if (!orgRow?.id) {
    console.error(`Facebook lead: unknown org slug "${org}"`)
    await captureUnroutedInbound(supabase, {
      channel: 'facebook_lead',
      identifier: org,
      reason: 'no_mapping',
      payload: rawPayload,
    })
    return { skipped: true, reason: 'unknown_org', org }
  }

  const orgId = orgRow.id
  const channelEnabled = await isFeatureEnabledForOrg(orgId, config.featureKey)
  if (!channelEnabled) {
    console.log(`${config.logLabel} disabled for org ${orgId}`)
    return { skipped: true, reason: `${config.featureKey}_disabled` }
  }

  const duplicate = await findDuplicateFacebookMessengerLead(
    supabase,
    orgId,
    config.source,
    conversationId ?? null,
    normalizedPhone
  )
  if (duplicate) {
    console.log(`${config.logLabel} duplicate conversation, returning existing lead ${duplicate.id}`)
    return { success: true, lead_id: duplicate.id, duplicate: true }
  }

  let extractedForAck: ExtractedLeadFields = facebookLeadFallbackParse(
    name,
    normalizedPhone,
    message,
    email,
    city,
    suburb,
    serviceNeeded
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
          details: message.slice(0, detailsMax),
          address: extractedForAck.address ?? null,
          source: config.source,
          lead_source: config.leadSource,
          raw_email: JSON.stringify(rawPayload),
        }),
      createdEvent: {
        note: config.createdNote,
        payload: {
          source: config.source,
          org_slug: org,
          ...(formName ? { form_name: formName } : {}),
          ...(conversationId ? { conversation_id: conversationId } : {}),
          ...(outOfArea ? { out_of_area: true } : {}),
        },
      },
      extract: async () => {
        let extractionStatus: ExtractionStatus = 'fallback'
        const claudeExtracted = await extractFacebookLeadWithClaude(
          name,
          normalizedPhone,
          message,
          email,
          channel
        )
        const extracted =
          claudeExtracted ??
          facebookLeadFallbackParse(
            name,
            normalizedPhone,
            message,
            email,
            city,
            suburb,
            serviceNeeded
          )
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
        source: config.source,
        resolvePhone: () => extractedForAck.phone?.trim() || normalizedPhone,
        resolveCustomerName: () => extractedForAck.name?.trim() || name,
      },
      logLabel: config.logLabel,
      run: {
        workflowKey: 'inbound_lead',
        triggerChannel: config.source,
        triggerSummary: {
          org_slug: org,
          source: config.source,
          ...(formName ? { form_name: formName } : {}),
        },
      },
    })

    return {
      success: true,
      lead_id: result.leadId,
      ...(result.partial ? { partial: true } : {}),
    }
  } catch (err) {
    console.error('Facebook lead processing error:', err)
    return { error: 'Lead processing failed', status: 500 }
  }
}

/**
 * POST /api/inbound-facebook-lead — Facebook → lead.
 * `channel: "messenger"` (default) = Botpress or native Meta bot; `channel: "lead_ads"` = Make.com.
 */
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

  const result = await ingestParsedFacebookLead(supabase, parsed.data, req.body)
  if ('error' in result) {
    res.status(result.status).json({ error: result.error })
    return
  }
  res.status(200).json(result)
}
