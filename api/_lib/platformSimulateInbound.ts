import type { VercelRequest, VercelResponse } from '@vercel/node'
import './loadLocalEnv.js'
import { authenticateRequest } from './auth.js'
import { getPlatformUrl } from './platformUrl.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { computeTwilioSignature } from './twilioSignature.js'
import { buildCloudmailinPlusAddress } from '../../shared/inboundEmailRouting.js'
import { invokeApiHandler } from './invokeApiHandler.js'

function isLocalDevHost(host: string | undefined): boolean {
  if (!host) return false
  return host.includes('localhost') || host.startsWith('127.0.0.1')
}

/** On Vercel preview/prod, self-fetch hits deployment protection and returns HTML — invoke handlers directly. */
function shouldInvokeHandlerDirectly(req: VercelRequest): boolean {
  if (isLocalDevHost(req.headers.host as string | undefined)) return false
  return process.env.VERCEL === '1'
}

function parseHandlerPath(path: string): { pathname: string; query: Record<string, string | string[]> } {
  const url = new URL(path, 'http://simulate.local')
  const query: Record<string, string | string[]> = {}
  url.searchParams.forEach((value, key) => {
    query[key] = value
  })
  return { pathname: url.pathname, query }
}

async function dispatchInboundHandler(
  parentReq: VercelRequest,
  baseUrl: string,
  path: string,
  init: RequestInit
): Promise<{ status: number; body: unknown; raw: string }> {
  if (!shouldInvokeHandlerDirectly(parentReq)) {
    return postHandler(baseUrl, path, init)
  }

  const { pathname, query } = parseHandlerPath(path)
  const host = parentReq.headers.host
  const headers: Record<string, string> = {}
  if (init.headers) {
    for (const [key, value] of Object.entries(init.headers)) {
      if (typeof value === 'string') headers[key] = value
    }
  }
  if (typeof host === 'string') {
    headers.host = host
  }

  if (pathname === '/api/inbound-sms') {
    const handler = (await import('../inbound-sms.js')).default
    const body =
      typeof init.body === 'string'
        ? Object.fromEntries(new URLSearchParams(init.body))
        : {}
    return invokeApiHandler(handler, {
      method: 'POST',
      url: pathname,
      headers,
      body,
      query,
    })
  }

  if (pathname === '/api/inbound-email') {
    const handler = (await import('../inbound-email.js')).default
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : {}
    return invokeApiHandler(handler, {
      method: 'POST',
      url: `${pathname}${new URL(path, 'http://simulate.local').search}`,
      headers,
      body,
      query,
    })
  }

  throw new Error(`Simulator cannot invoke unknown handler path: ${pathname}`)
}

function looksLikeHtmlResponse(raw: string): boolean {
  const trimmed = raw.trimStart().toLowerCase()
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')
}

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

async function simulateSms(parentReq: VercelRequest, baseUrl: string, text: string, toNumber: string) {
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

  return dispatchInboundHandler(parentReq, baseUrl, '/api/inbound-sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: formBody,
  })
}

async function simulateEmail(
  parentReq: VercelRequest,
  baseUrl: string,
  text: string,
  inboundEmailTag: string
) {
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

  return dispatchInboundHandler(
    parentReq,
    baseUrl,
    `/api/inbound-email?secret=${encodeURIComponent(secret)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )
}

function buildVoicemailPlain(calledNumber: string): string {
  return [
    `From: ${SIMULATED_FROM}`,
    `To: "${calledNumber}" - "Simulated extension"`,
    'Received: "Simulated test"',
    'Duration: "12"',
  ].join('\n')
}

async function simulateVoicemail(
  parentReq: VercelRequest,
  baseUrl: string,
  text: string,
  calledNumber: string
) {
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

  return dispatchInboundHandler(
    parentReq,
    baseUrl,
    `/api/inbound-email?secret=${encodeURIComponent(secret)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )
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
      handlerResult = await simulateSms(req, baseUrl, text.trim(), toNumber)
    } else if (channel === 'email') {
      const tag = (org.inbound_email_tag as string | null)?.trim()
      if (!tag) {
        res.status(400).json({ error: 'Org has no inbound_email_tag configured' })
        return
      }
      handlerResult = await simulateEmail(req, baseUrl, text.trim(), tag)
    } else {
      const calledNumber = await resolveMappedPhoneForOrg(orgId)
      handlerResult = await simulateVoicemail(req, baseUrl, text.trim(), calledNumber)
    }

    if (looksLikeHtmlResponse(handlerResult.raw)) {
      res.status(500).json({
        error:
          'Simulator received HTML instead of an API response. Redeploy preview after the direct-invoke fix.',
        simulated: true,
        channel,
        orgId,
        handlerStatus: handlerResult.status,
      })
      return
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
