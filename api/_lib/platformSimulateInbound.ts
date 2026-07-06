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

/** Invoke handlers in-process when self-fetch would fail (deployment protection or Vite-only dev). */
function shouldInvokeHandlerDirectly(req: VercelRequest): boolean {
  if (isLocalDevHost(req.headers.host as string | undefined)) return true
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

  if (pathname === '/api/inbound-sms' && query.action === 'meta-webhook') {
    const handler = (await import('../inbound-sms.js')).default
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : {}
    return invokeApiHandler(handler, {
      method: 'POST',
      url: pathname,
      headers,
      body,
      query,
    })
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

type SimulateChannel = 'sms' | 'email' | 'voicemail' | 'facebook' | 'instagram'

interface SimulateInboundBody {
  channel?: SimulateChannel
  orgId?: string
  text?: string
}

const SIMULATED_FROM = '+61400000000'
const SIMULATED_PREFIX = '[SIMULATED TEST]'
/** Sentinel orgId — fires inbound with deliberately unmapped routing (unrouted_inbound capture). */
export const UNROUTED_SIM_ORG_ID = '__unrouted__'
/** DID guaranteed absent from org_phone_numbers — used for unrouted SMS/voicemail/call tests. */
export const UNROUTED_SIM_DID = '+61999999999'

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

async function findRecentUnroutedCapture(
  channel: string,
  identifier: string | null
): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const since = new Date(Date.now() - 120_000).toISOString()
  let query = supabase
    .from('unrouted_inbound')
    .select('id')
    .eq('channel', channel)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)

  if (identifier?.trim()) {
    query = query.eq('identifier', identifier.trim())
  }

  const { data } = await query.maybeSingle()
  return data?.id ?? null
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

async function simulateEmailUnrouted(parentReq: VercelRequest, baseUrl: string, text: string) {
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

  const payload = {
    plain: `${SIMULATED_PREFIX} ${text}`,
    subject: 'Simulated unrouted test enquiry',
    from: 'test-simulator@fieldbourne.internal',
    headers: {},
    attachments: [] as unknown[],
    envelope: { to: base, recipients: [base] },
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

async function simulateMetaMessaging(
  parentReq: VercelRequest,
  baseUrl: string,
  channel: 'facebook' | 'instagram',
  text: string,
  pageConfig: { page_id: string; instagram_business_account_id: string | null }
) {
  const objectType = channel === 'facebook' ? 'page' : 'instagram'
  const entryId =
    channel === 'facebook'
      ? pageConfig.page_id
      : pageConfig.instagram_business_account_id ?? pageConfig.page_id

  const payload = {
    object: objectType,
    entry: [
      {
        id: entryId,
        messaging: [
          {
            sender: { id: `simulated-${channel}-user` },
            recipient: { id: entryId },
            message: { text: `${SIMULATED_PREFIX} ${text}`, mid: `sim-${Date.now()}` },
          },
        ],
      },
    ],
  }

  return dispatchInboundHandler(parentReq, baseUrl, '/api/inbound-sms?action=meta-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function lookupOrgFacebookPage(orgId: string) {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data } = await supabase
    .from('org_facebook_pages')
    .select('page_id, instagram_business_account_id')
    .eq('org_id', orgId)
    .maybeSingle()
  return data
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

  if (!channel || !['sms', 'email', 'voicemail', 'facebook', 'instagram'].includes(channel)) {
    res.status(400).json({ error: 'channel must be sms, email, voicemail, facebook, or instagram' })
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

  const unrouted = orgId.trim() === UNROUTED_SIM_ORG_ID

  if (unrouted && (channel === 'facebook' || channel === 'instagram')) {
    res.status(400).json({
      error: 'Unrouted test is not supported for Meta channels — use SMS, email, or voicemail.',
    })
    return
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    res.status(500).json({ error: 'Server misconfiguration — Supabase env missing' })
    return
  }

  let org: { id: string; name: string; inbound_email_tag: string | null } | null = null
  if (!unrouted) {
    const { data, error: orgError } = await supabase
      .from('orgs')
      .select('id, name, inbound_email_tag')
      .eq('id', orgId)
      .maybeSingle()

    if (orgError || !data) {
      res.status(400).json({ error: 'orgId not found' })
      return
    }
    org = data
  }

  const baseUrl = platformUrlFromRequest(req)

  try {
    let handlerResult: Awaited<ReturnType<typeof postHandler>>
    let unroutedChannel: string | null = null
    let unroutedIdentifier: string | null = null

    if (unrouted && channel === 'sms') {
      unroutedChannel = 'sms'
      unroutedIdentifier = UNROUTED_SIM_DID
      handlerResult = await simulateSms(req, baseUrl, text.trim(), UNROUTED_SIM_DID)
    } else if (unrouted && channel === 'email') {
      unroutedChannel = 'email'
      unroutedIdentifier = null
      handlerResult = await simulateEmailUnrouted(req, baseUrl, text.trim())
    } else if (unrouted && channel === 'voicemail') {
      unroutedChannel = 'voicemail'
      unroutedIdentifier = UNROUTED_SIM_DID
      handlerResult = await simulateVoicemail(req, baseUrl, text.trim(), UNROUTED_SIM_DID)
    } else if (channel === 'sms') {
      const toNumber = await resolveMappedPhoneForOrg(orgId)
      handlerResult = await simulateSms(req, baseUrl, text.trim(), toNumber)
    } else if (channel === 'email') {
      const tag = (org.inbound_email_tag as string | null)?.trim()
      if (!tag) {
        res.status(400).json({ error: 'Org has no inbound_email_tag configured' })
        return
      }
      handlerResult = await simulateEmail(req, baseUrl, text.trim(), tag)
    } else if (channel === 'facebook' || channel === 'instagram') {
      const pageConfig = await lookupOrgFacebookPage(orgId)
      if (!pageConfig?.page_id) {
        res.status(400).json({
          error:
            'No org_facebook_pages row for this org. Add page_id (and instagram_business_account_id for IG).',
        })
        return
      }
      if (channel === 'instagram' && !pageConfig.instagram_business_account_id) {
        res.status(400).json({ error: 'Org has no instagram_business_account_id configured' })
        return
      }
      handlerResult = await simulateMetaMessaging(req, baseUrl, channel, text.trim(), pageConfig)
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

    let leadId: string | null = null
    let unroutedCaptureId: string | null = null

    if (unrouted) {
      if (handlerResult.status === 200 && unroutedChannel) {
        unroutedCaptureId = await findRecentUnroutedCapture(unroutedChannel, unroutedIdentifier)
      }
    } else {
      leadId = extractLeadId(handlerResult.body)
      if (!leadId && handlerResult.status === 200) {
        leadId = await findRecentSimulatedLead(orgId)
      }
    }

    res.status(200).json({
      simulated: true,
      unrouted,
      channel,
      orgId: unrouted ? null : orgId,
      orgName: unrouted ? null : org?.name ?? null,
      leadId,
      unroutedCaptureId,
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
