import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { authenticateRequest } from './_lib/auth.js'
import { getPlatformUrl } from './_lib/platformUrl.js'
import { computeTwilioSignature } from './_lib/twilioSignature.js'
import { buildCloudmailinPlusAddress } from '../shared/inboundEmailRouting.js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

async function postHandler(
  path: string,
  init: RequestInit
): Promise<{ status: number; body: unknown; raw: string }> {
  const baseUrl = getPlatformUrl()
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

async function simulateSms(text: string, toNumber: string) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    throw new Error('TWILIO_AUTH_TOKEN is not configured on this deployment')
  }

  const params: Record<string, string> = {
    Body: `${SIMULATED_PREFIX} ${text}`,
    From: SIMULATED_FROM,
    To: toNumber,
  }

  const baseUrl = getPlatformUrl()
  const webhookUrl = `${baseUrl}/api/inbound-sms`
  const signature = computeTwilioSignature(webhookUrl, params, authToken)
  const formBody = new URLSearchParams(params).toString()

  return postHandler('/api/inbound-sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: formBody,
  })
}

async function simulateEmail(text: string, inboundEmailTag: string) {
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

  return postHandler(`/api/inbound-email?secret=${encodeURIComponent(secret)}`, {
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

async function simulateVoicemail(text: string, calledNumber: string) {
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

  return postHandler(`/api/inbound-email?secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await authenticateRequest(req)
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (auth.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Forbidden — platform_admin only' })
  }

  const { channel, orgId, text } = req.body as SimulateInboundBody

  if (!channel || !['sms', 'email', 'voicemail'].includes(channel)) {
    return res.status(400).json({ error: 'channel must be sms, email, or voicemail' })
  }
  if (!orgId?.trim()) {
    return res.status(400).json({ error: 'orgId is required' })
  }
  if (!text?.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }

  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('id, name, inbound_email_tag')
    .eq('id', orgId)
    .maybeSingle()

  if (orgError || !org) {
    return res.status(400).json({ error: 'orgId not found' })
  }

  try {
    let handlerResult: Awaited<ReturnType<typeof postHandler>>

    if (channel === 'sms') {
      const toNumber = await resolveMappedPhoneForOrg(orgId)
      handlerResult = await simulateSms(text.trim(), toNumber)
    } else if (channel === 'email') {
      const tag = (org.inbound_email_tag as string | null)?.trim()
      if (!tag) {
        return res.status(400).json({ error: 'Org has no inbound_email_tag configured' })
      }
      handlerResult = await simulateEmail(text.trim(), tag)
    } else {
      const calledNumber = await resolveMappedPhoneForOrg(orgId)
      handlerResult = await simulateVoicemail(text.trim(), calledNumber)
    }

    const leadId = extractLeadId(handlerResult.body)

    return res.status(200).json({
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
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Simulation failed',
      simulated: true,
      channel,
      orgId,
    })
  }
}
