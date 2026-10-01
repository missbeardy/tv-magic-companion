import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { waitUntil } from '@vercel/functions'
import {
  buildGameLeadDetails,
  GAME_LEAD_LEAD_SOURCE,
  GAME_LEAD_SOURCE,
  parseGameLeadBody,
  serviceTypeForGameJob,
} from '../../shared/gameLead.js'
import { findRecentLeadByPhone } from './inboundLeadDedup.js'
import { formatAuPhoneForSms } from './phone.js'
import { processInboundLead } from './processInboundLead.js'
import { checkRateLimit, rateLimitIdentifier } from './rateLimit.js'
import { insertRawFirstLead } from './rawFirstLead.js'
import { safeCompareSecret } from './timingSafeCompare.js'

function gameOrgSlug(): string {
  return process.env.GAME_LEAD_ORG_SLUG?.trim() || 'default'
}

/**
 * Lead from the "TV Magic: First Job" marketing game (separate static site).
 * Server-to-server: the game's /api/lead function holds GAME_LEAD_SECRET.
 * No feature switch (owner decision 28-09-2026) — unset the secret to turn it off.
 */
export async function handleGameLead(
  req: VercelRequest,
  res: VercelResponse,
  supabase: SupabaseClient
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const secret = req.headers['x-game-lead-secret']
  if (!safeCompareSecret(typeof secret === 'string' ? secret : undefined, process.env.GAME_LEAD_SECRET)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const parsed = parseGameLeadBody(req.body)
  if (!parsed.ok) {
    if (parsed.honeypot) {
      res.status(200).json({ success: true })
      return
    }
    res.status(400).json({ error: parsed.error })
    return
  }
  const data = parsed.data

  // Every request comes from the game's function, so rate-limit on the player's IP it forwards.
  const allowed = await checkRateLimit({
    scope: 'game-lead',
    identifier: data.clientIp ?? rateLimitIdentifier(req.headers),
    limit: 5,
    windowMs: 60 * 60 * 1000,
    failClosed: true,
  })
  if (!allowed) {
    res.status(429).json({ error: 'Too many submissions. Try again later.' })
    return
  }

  const orgSlug = gameOrgSlug()
  const { data: orgRow, error: orgError } = await supabase
    .from('orgs')
    .select('id')
    .eq('slug', orgSlug)
    .maybeSingle()
  if (orgError || !orgRow?.id) {
    // The game keeps the lead in the player's browser and resends it, so nothing is lost.
    console.error(`Game lead: org lookup failed for slug "${orgSlug}"`, orgError?.message)
    res.status(500).json({ error: 'Lead could not be saved' })
    return
  }
  const orgId = orgRow.id as string

  const phone = formatAuPhoneForSms(data.mobile)
  const duplicate = await findRecentLeadByPhone(supabase, phone, orgId)
  if (duplicate) {
    res.status(200).json({ success: true, lead_id: duplicate.id, duplicate: true })
    return
  }

  const serviceType = serviceTypeForGameJob(data.jobNeeded)
  const stored = { ...data, clientIp: undefined }

  let releaseAck: (leadId: string) => void = () => {}
  const inserted = new Promise<string>((resolve) => {
    releaseAck = resolve
  })

  const work = processInboundLead({
    supabase,
    orgId,
    insertLead: () =>
      insertRawFirstLead(supabase, orgId, {
        org_id: orgId,
        name: data.name,
        phone,
        address: data.suburb,
        service_type: serviceType,
        details: buildGameLeadDetails(data),
        source: GAME_LEAD_SOURCE,
        lead_source: GAME_LEAD_LEAD_SOURCE,
        raw_email: JSON.stringify(stored),
      }),
    createdEvent: {
      note: 'Lead captured from the First Job game (raw-first)',
      payload: {
        source: GAME_LEAD_SOURCE,
        discount_code: data.discountCode,
        feedback: data.feedback,
        utm: data.meta.utm,
        consent_at: data.consent.at,
      },
    },
    onLeadInserted: releaseAck,
    buildNotify: ({ savedLead }) => ({
      name: savedLead?.name || data.name,
      service_type: savedLead?.service_type || serviceType,
      status: savedLead?.status || 'unassigned',
    }),
    followUp: {
      type: 'ack',
      source: GAME_LEAD_SOURCE,
      resolvePhone: () => phone,
      resolveCustomerName: () => data.name,
    },
    logLabel: 'inbound first job game',
    run: {
      workflowKey: 'inbound_lead',
      triggerChannel: GAME_LEAD_SOURCE,
      triggerSummary: { org_slug: orgSlug, source: GAME_LEAD_SOURCE, job: data.jobNeeded },
    },
  })

  // Answer as soon as the row exists; manager alerts + ack SMS finish under waitUntil
  // (a bare promise is frozen when the response flushes — see handleInboundFacebookLead).
  waitUntil(work.catch((err) => console.error('Game lead pipeline error:', err)))

  try {
    const settled = await Promise.race([
      inserted.then((leadId) => ({ leadId })),
      work.then((result) => ({ leadId: result.leadId })),
    ])
    res.status(200).json({ success: true, lead_id: settled.leadId })
  } catch (err) {
    console.error('Game lead processing error:', err)
    res.status(500).json({ error: 'Lead could not be saved' })
  }
}
