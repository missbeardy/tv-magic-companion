import type { VercelRequest, VercelResponse } from '@vercel/node'
import './_lib/loadLocalEnv.js'
import { authenticateRequest } from './_lib/auth.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { applyLeadExtractionRetry } from './_lib/retryLeadExtraction.js'

const MIN_REASON_LENGTH = 3

function isManagerRole(role: string): boolean {
  return role === 'manager' || role === 'platform_admin'
}

async function handleDeleteLead(req: VercelRequest, res: VercelResponse) {
  const auth = await authenticateRequest(req)
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!isManagerRole(auth.role)) {
    return res.status(403).json({ error: 'Only managers can remove leads' })
  }

  const { leadId, reason } = req.body as { leadId?: string; reason?: string }
  if (!leadId?.trim()) {
    return res.status(400).json({ error: 'Missing leadId' })
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
  if (trimmedReason.length < MIN_REASON_LENGTH) {
    return res.status(400).json({ error: `Reason is required (min ${MIN_REASON_LENGTH} characters)` })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, org_id, deleted_at')
    .eq('id', leadId.trim())
    .maybeSingle()

  if (leadError || !lead) {
    return res.status(404).json({ error: 'Lead not found' })
  }

  if (lead.deleted_at) {
    return res.status(409).json({ error: 'Lead is already removed' })
  }

  if (auth.role !== 'platform_admin' && lead.org_id !== auth.orgId) {
    return res.status(403).json({ error: 'Lead is outside your organisation' })
  }

  const deletedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('leads')
    .update({
      deleted_at: deletedAt,
      deleted_by: auth.userId,
      delete_reason: trimmedReason,
    })
    .eq('id', lead.id)

  if (updateError) {
    console.error('Lead soft-delete failed:', updateError.message)
    return res.status(500).json({ error: 'Failed to remove lead' })
  }

  const { error: eventError } = await supabase.from('lead_events').insert({
    lead_id: lead.id,
    org_id: lead.org_id,
    event_type: 'deleted',
    note: trimmedReason,
    created_by: auth.userId,
    payload: { reason: trimmedReason, deleted_by: auth.userId },
  })

  if (eventError) {
    console.error('Lead delete event failed:', eventError.message)
  }

  return res.status(200).json({ success: true })
}

async function handleRetryExtraction(req: VercelRequest, res: VercelResponse) {
  const auth = await authenticateRequest(req)
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!isManagerRole(auth.role)) {
    return res.status(403).json({ error: 'Only managers can retry extraction' })
  }

  const { leadId } = req.body as { leadId?: string }
  if (!leadId?.trim()) {
    return res.status(400).json({ error: 'Missing leadId' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, org_id, source, name, phone, email, raw_sms, raw_email, extraction_status, deleted_at')
    .eq('id', leadId.trim())
    .maybeSingle()

  if (leadError || !lead) {
    return res.status(404).json({ error: 'Lead not found' })
  }

  if (lead.deleted_at) {
    return res.status(409).json({ error: 'Lead is removed' })
  }

  if (auth.role !== 'platform_admin' && lead.org_id !== auth.orgId) {
    return res.status(403).json({ error: 'Lead is outside your organisation' })
  }

  if (!lead.raw_sms && !lead.raw_email) {
    return res.status(400).json({ error: 'Lead has no raw source to retry extraction' })
  }

  try {
    const result = await applyLeadExtractionRetry(
      supabase,
      {
        id: lead.id,
        org_id: lead.org_id!,
        source: lead.source,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        raw_sms: lead.raw_sms,
        raw_email: lead.raw_email,
        extraction_status: lead.extraction_status,
      },
      auth.userId
    )

    return res.status(200).json({
      success: true,
      extraction_status: result.status,
      fields: result.fields,
    })
  } catch (err) {
    console.error('Lead extraction retry failed:', err)
    return res.status(500).json({ error: 'Extraction retry failed' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : undefined

  if (action === 'delete') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }
    return handleDeleteLead(req, res)
  }

  if (action === 'retry-extraction') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }
    return handleRetryExtraction(req, res)
  }

  return res.status(404).json({ error: 'Unknown action' })
}
