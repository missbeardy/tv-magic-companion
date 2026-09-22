import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildCampaignLeadDetails,
  CAMPAIGN_LEAD_SOURCE,
  CAMPAIGN_SOURCE,
  parseCampaignQuoteBody,
  serviceTypeForProductKind,
} from '../../shared/campaignQuote.js'
import { captureUnroutedInbound } from './captureUnroutedInbound.js'
import { isFeatureEnabledForOrg } from './featureSwitches.js'
import { findRecentLeadByPhone } from './inboundLeadDedup.js'
import { formatAuPhoneForSms, isAuMobile } from './phone.js'
import { processInboundLead } from './processInboundLead.js'
import { checkRateLimit, rateLimitIdentifier } from './rateLimit.js'
import { insertRawFirstLead } from './rawFirstLead.js'

const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/

function campaignOrgSlug(): string {
  return process.env.CAMPAIGN_ORG_SLUG?.trim() || 'default'
}

function resolveOrgSlug(req: VercelRequest): string {
  const fromQuery = typeof req.query.orgSlug === 'string' ? req.query.orgSlug.trim() : ''
  if (fromQuery && SLUG_PATTERN.test(fromQuery)) return fromQuery
  const body = req.body
  const fromBody =
    body && typeof body === 'object' && typeof (body as Record<string, unknown>).orgSlug === 'string'
      ? ((body as Record<string, unknown>).orgSlug as string).trim()
      : ''
  if (fromBody && SLUG_PATTERN.test(fromBody)) return fromBody
  return campaignOrgSlug()
}

interface CampaignOrgRow {
  id: string
  name: string | null
  logo_url: string | null
  website: string | null
  primary_color: string | null
  secondary_color: string | null
}

/** Public branding for the /visualise/:orgSlug page — no auth, no PII. */
async function handleCampaignOrgBranding(
  req: VercelRequest,
  res: VercelResponse,
  supabase: SupabaseClient
): Promise<void> {
  const orgSlug = resolveOrgSlug(req)
  const { data: orgRow, error } = await supabase
    .from('orgs')
    .select('id, name, logo_url, website, primary_color, secondary_color')
    .eq('slug', orgSlug)
    .maybeSingle<CampaignOrgRow>()

  if (error || !orgRow?.id) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const enabled = await isFeatureEnabledForOrg(orgRow.id, 'campaign_quote')
  if (!enabled) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  res.status(200).json({
    name: orgRow.name || 'TV Magic',
    logoUrl: orgRow.logo_url || null,
    website: orgRow.website || null,
    primaryColor: orgRow.primary_color || '#004B93',
    secondaryColor: orgRow.secondary_color || '#00B4C5',
  })
}

export async function handleCampaignQuote(
  req: VercelRequest,
  res: VercelResponse,
  supabase: SupabaseClient
): Promise<void> {
  if (req.method === 'GET') {
    await handleCampaignOrgBranding(req, res, supabase)
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const identifier = rateLimitIdentifier(req.headers['x-forwarded-for'] as string | undefined)
  const allowed = await checkRateLimit({
    scope: 'campaign-quote',
    identifier,
    limit: 8,
    windowMs: 60 * 60 * 1000,
  })
  if (!allowed) {
    res.status(429).json({ error: 'Too many quotes from this connection. Try again later.' })
    return
  }

  const parsed = parseCampaignQuoteBody(req.body)
  if (!parsed.ok) {
    if (parsed.honeypot) {
      res.status(200).json({ success: true })
      return
    }
    res.status(400).json({ error: parsed.error })
    return
  }

  const data = parsed.data
  if (!isAuMobile(data.phone)) {
    res.status(400).json({ error: 'Enter an Australian mobile number' })
    return
  }

  const orgSlug = resolveOrgSlug(req)
  const { data: orgRow, error: orgError } = await supabase
    .from('orgs')
    .select('id')
    .eq('slug', orgSlug)
    .maybeSingle()

  if (orgError) {
    console.error('Campaign quote: org lookup failed', orgError.message)
    res.status(500).json({ error: 'Quote could not be sent' })
    return
  }

  if (!orgRow?.id) {
    console.error(`Campaign quote: unknown org slug "${orgSlug}"`)
    await captureUnroutedInbound(supabase, {
      channel: CAMPAIGN_SOURCE,
      identifier: orgSlug,
      reason: 'no_mapping',
      payload: data,
    })
    res.status(500).json({ error: 'Quote could not be sent' })
    return
  }

  const orgId = orgRow.id as string

  const campaignQuoteEnabled = await isFeatureEnabledForOrg(orgId, 'campaign_quote')
  if (!campaignQuoteEnabled) {
    await captureUnroutedInbound(supabase, {
      channel: CAMPAIGN_SOURCE,
      identifier: orgSlug,
      reason: 'not_configured',
      payload: data,
    })
    res.status(404).json({ error: 'Not found' })
    return
  }
  const phone = formatAuPhoneForSms(data.phone)
  const duplicate = await findRecentLeadByPhone(supabase, phone, orgId)
  if (duplicate) {
    res.status(200).json({ success: true, lead_id: duplicate.id, duplicate: true })
    return
  }

  const details = buildCampaignLeadDetails(data)
  const serviceType = serviceTypeForProductKind(data.productKind)

  try {
    const result = await processInboundLead({
      supabase,
      orgId,
      insertLead: () =>
        insertRawFirstLead(supabase, orgId, {
          org_id: orgId,
          name: data.name,
          phone,
          address: data.address,
          service_type: serviceType,
          details,
          source: CAMPAIGN_SOURCE,
          lead_source: CAMPAIGN_LEAD_SOURCE,
          raw_email: JSON.stringify(data),
        }),
      createdEvent: {
        note: 'Lead captured from the wall visualiser (raw-first)',
        payload: {
          source: CAMPAIGN_SOURCE,
          product_id: data.productId,
          centre_height_mm: data.centreHeightMm,
        },
      },
      buildNotify: ({ savedLead }) => ({
        name: savedLead?.name || data.name,
        service_type: savedLead?.service_type || serviceType,
        status: savedLead?.status || 'unassigned',
      }),
      followUp: {
        type: 'ack',
        source: CAMPAIGN_SOURCE,
        resolvePhone: () => phone,
        resolveCustomerName: () => data.name,
      },
      logLabel: 'inbound wall visualiser',
      run: {
        workflowKey: 'inbound_lead',
        triggerChannel: CAMPAIGN_SOURCE,
        triggerSummary: {
          org_slug: orgSlug,
          source: CAMPAIGN_SOURCE,
          product_id: data.productId,
        },
      },
    })

    res.status(200).json({ success: true, lead_id: result.leadId })
  } catch (err) {
    console.error('Campaign quote processing error:', err)
    res.status(500).json({ error: 'Quote could not be sent' })
  }
}
