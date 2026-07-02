import type { VercelRequest, VercelResponse } from '@vercel/node'
import './loadLocalEnv.js'
import { authenticateRequest } from './auth.js'
import { getPlatformUrl } from './platformUrl.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { computeTwilioSignature } from './twilioSignature.js'
import { buildCloudmailinPlusAddress } from '../../shared/inboundEmailRouting.js'

function platformUrlFromRequest(req: VercelRequest): string {
  const host = req.headers.host
  if (typeof host === 'string' && host.length > 0) {
    const proto =
      host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
    return `${proto}://${host}`
  }
  return getPlatformUrl()
}

type SimulateChannel = 'sms' | 'email' | 'voicemail'

interface SimulateInboundBody {
  channel?: SimulateChannel
  orgId?: string
  text?: string
}

const SIMULATED_FROM = '+61400000000'
const SIMULATED_PREFIX = '[SIMULATED TEST]'

function cloudmailinBase(): string | null {
  const base =
    process.env.CLOUDMAILIN_INBOUND_BASE?.trim() ||
    process.env.VITE_CLOUDMAILIN_INBOUND_BASE?.trim()
  return base || null
}

async function lookupOrgPhoneNumber(orgId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data } = await supabase
    .from('org_phone_numbers')
    .select('phone_number')
    .eq('org_id', orgId)
    .maybeSingle()
  return data?.phone_number ?? null
}

async function resolveMappedPhoneForOrg(orgId: string): Promise<string> {
  const mapped = await lookupOrgPhoneNumber(orgId)
  if (mapped) return mapped

  throw new Error(
    `No phone number mapped in org_phone_numbers for org ${orgId}. ` +
      'Add a row linking this org to its inbound DID before simulating SMS or voicemail.'
  )
}

function extractLeadId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  const id = obj.lead_id ?? obj.leadId
  return typeof id === 'string' && id.length > 0 ? id : null
}

async function findRecentSimulatedLead(orgId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const since = new Date(Date.now() - 120_000).toISOString()
  const { data } = await supabase
    .from('leads')
    .select('id')
    .eq('org_id', orgId)
    .gte('created_at', since)
    .or('details.ilike.%[SIMULATED TEST]%,raw_sms.ilike.%SIMULATED TEST%,raw_email.ilike.%SIMULATED TEST%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function postHandler(
  baseUrl: string,
  path: string,
  init: RequestInit
): Promise<{ status: number; body: unknown; raw: string }> {
  const url = `${baseUrl}${path}`
  const res = await fetch(url, init)
  const raw = await res.text()
  let body: unknown = raw
  try {
    body = JSON.parse(raw)
  } catch {
    // TwiML or plain text
  }
  return { status: res.status, body, raw }
}

async function simulateSms(baseUrl: string, text: string, toNumber: string) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    throw new Error('TWILIO_AUTH_TOKEN is not configured on this deployment')
  }

  const params: Record<string, string> = {
    Body: `${SIMULATED_PREFIX} ${text}`,
    From: SIMULATED_FROM,
    To: toNumber,
  }

  const webhookUrl = `${baseUrl}/api/inbound-sms`
  const signature = computeTwilioSignature(webhookUrl, params, authToken)
  const formBody = new URLSearchParams(params).toString()

  return postHandler(baseUrl, '/api/inbound-sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: formBody,
  })
}

async function simulateEmail(baseUrl: string, text: string, inboundEmailTag: string) {
  const secret = process.env.INBOUND_SECRET
  if (!secret) {
    throw new Error('INBOUND_SECRET is not configured on this deployment')
  }

  const base = cloudmailinBase()
  if (!base) {
    throw new Error(
      'CLOUDMAILIN_INBOUND_BASE (or VITE_CLOUDMAILIN_INBOUND_BASE) is not configured'
    )
  }

  const plusAddress = buildCloudmailinPlusAddress(base, inboundEmailTag)
  const payload = {
    plain: `${SIMULATED_PREFIX} ${text}`,
    subject: 'Simulated test enquiry',
    from: 'test-simulator@fieldbourne.internal',
    headers: {},
    attachments: [] as unknown[],
    envelope: { to: plusAddress, recipients: [plusAddress] },
  }

  return postHandler(baseUrl, `/api/inbound-email?secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function buildVoicemailPlain(calledNumber: string): string {
  return [
    `From: ${SIMULATED_FROM}`,
    `To: "${calledNumber}" - "Simulated extension"`,
    'Received: "Simulated test"',
    'Duration: "12"',
  ].join('\n')
}

async function simulateVoicemail(baseUrl: string, text: string, calledNumber: string) {
  const secret = process.env.INBOUND_SECRET
  if (!secret) {
    throw new Error('INBOUND_SECRET is not configured on this deployment')
  }

  const plain = buildVoicemailPlain(calledNumber)
  const payload = {
    plain,
    subject: `New Voicemail from ${SIMULATED_FROM}`,
    from: 'test-simulator@fieldbourne.internal',
    headers: {},
    simulated_transcript: `${SIMULATED_PREFIX} ${text}`,
    attachments: [
      {
        file_name: 'simulated-test.wav',
        content_type: 'audio/wav',
        content: '',
      },
    ],
  }

  return postHandler(baseUrl, `/api/inbound-email?secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

/** Platform admin inbound simulator — consolidated under create-user for Hobby 12-function limit. */
export async function handlePlatformSimulateInbound(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const auth = await authenticateRequest(req)
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  if (auth.role !== 'platform_admin') {
    res.status(403).json({ error: 'Forbidden — platform_admin only' })
    return
  }

  const { channel, orgId, text } = req.body as SimulateInboundBody

  if (!channel || !['sms', 'email', 'voicemail'].includes(channel)) {
    res.status(400).json({ error: 'channel must be sms, email, or voicemail' })
    return
  }
  if (!orgId?.trim()) {
    res.status(400).json({ error: 'orgId is required' })
    return
  }
  if (!text?.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    res.status(500).json({ error: 'Server misconfiguration — Supabase env missing' })
    return
  }

  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('id, name, inbound_email_tag')
    .eq('id', orgId)
    .maybeSingle()

  if (orgError || !org) {
    res.status(400).json({ error: 'orgId not found' })
    return
  }

  const baseUrl = platformUrlFromRequest(req)

  try {
    let handlerResult: Awaited<ReturnType<typeof postHandler>>

    if (channel === 'sms') {
      const toNumber = await resolveMappedPhoneForOrg(orgId)
      handlerResult = await simulateSms(baseUrl, text.trim(), toNumber)
    } else if (channel === 'email') {
      const tag = (org.inbound_email_tag as string | null)?.trim()
      if (!tag) {
        res.status(400).json({ error: 'Org has no inbound_email_tag configured' })
        return
      }
      handlerResult = await simulateEmail(baseUrl, text.trim(), tag)
    } else {
      const calledNumber = await resolveMappedPhoneForOrg(orgId)
      handlerResult = await simulateVoicemail(baseUrl, text.trim(), calledNumber)
    }

    let leadId = extractLeadId(handlerResult.body)
    if (!leadId && handlerResult.status === 200) {
      leadId = await findRecentSimulatedLead(orgId)
    }

    res.status(200).json({
      simulated: true,
      channel,
      orgId,
      orgName: org.name,
      leadId,
      handlerStatus: handlerResult.status,
      handlerResponse: handlerResult.body,
      handlerRaw: handlerResult.raw,
    })
  } catch (err) {
    console.error('platform-simulate-inbound error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Simulation failed',
      simulated: true,
      channel,
      orgId,
    })
  }
}
