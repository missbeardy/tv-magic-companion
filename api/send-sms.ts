// api/send-sms.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequestDetailed, authErrorMessage, type AuthContext } from './_lib/auth.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { buildSmsFromBrand } from './_lib/smsTemplates.js'
import { getPlatformUrl } from './_lib/platformUrl.js'
import { notifyManagersNewLead } from './_lib/notifyManagersNewLead.js'
import { formatAuPhoneForSms, phoneCandidates } from './_lib/phone.js'
import { isFeatureEnabledForOrg } from './_lib/featureSwitches.js'
import { acceptQuoteByToken, createQuote, getQuoteByToken } from './_lib/quotes.js'
import { createAndSendInvoice, markInvoicePaid } from './_lib/invoices.js'
import { runContactFollowUpCron } from './_lib/runContactFollowUpCron.js'
import { runInvoiceChaseSweep } from './_lib/invoiceChase.js'
import { purgeOldWorkflowRuns } from './_lib/workflowRun.js'
import { loadLocalEnvIfNeeded } from './_lib/loadLocalEnv.js'
import { notifyOrgUser } from './_lib/notifyUser.js'
import { sendEmployeeAlertWithSmsFallback } from './_lib/sendEmployeeAlert.js'
import {
  buildEmployeeWhatsAppMessage,
  getEmployeeWhatsAppContentSid,
  isStaticAssignmentWhatsAppTemplate,
  whatsAppTemplateKeyForMode,
} from './_lib/employeeWhatsAppTemplates.js'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

function getRequestBaseUrl(req: VercelRequest): string | null {
  const protoHeader = req.headers['x-forwarded-proto']
  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host
  const proto = Array.isArray(protoHeader)
    ? protoHeader[0]
    : typeof protoHeader === 'string' && protoHeader.trim()
    ? protoHeader.split(',')[0].trim()
    : 'https'
  const host = Array.isArray(hostHeader)
    ? hostHeader[0]
    : typeof hostHeader === 'string' && hostHeader.trim()
    ? hostHeader.split(',')[0].trim()
    : ''
  if (!host) return null
  return `${proto}://${host}`.replace(/\/$/, '')
}

/** True if `to` belongs to a lead or customer in the caller's org. */
async function phoneBelongsToOrg(to: string, orgId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return false
  const candidates = phoneCandidates(to)

  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('org_id', orgId)
    .in('phone', candidates)
    .limit(1)
    .maybeSingle()
  if (lead) return true

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('org_id', orgId)
    .in('phone', candidates)
    .limit(1)
    .maybeSingle()
  return Boolean(customer)
}

/** True if `to` is the phone of a team member (technician/manager) in the org. */
async function technicianInOrg(to: string, orgId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return false
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .in('phone', phoneCandidates(to))
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}

async function loadOrgReviewSettings(orgId: string): Promise<{
  google_review_url: string | null
  review_requests_enabled: boolean
  migrationMissing: boolean
}> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { google_review_url: null, review_requests_enabled: true, migrationMissing: false }
  }

  const { data, error } = await supabase
    .from('orgs')
    .select('google_review_url, review_requests_enabled')
    .eq('id', orgId)
    .maybeSingle()

  if (error) {
    console.error('Review settings load failed (run migration 20250627120000?):', error.message)
    return { google_review_url: null, review_requests_enabled: true, migrationMissing: true }
  }

  return {
    google_review_url: (data?.google_review_url as string | null) ?? null,
    review_requests_enabled: data?.review_requests_enabled !== false,
    migrationMissing: false,
  }
}

/**
 * Notify a user inside the caller's org (in-app bell + OneSignal + WhatsApp).
 */
async function handleNotify(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { userId, title, message, url, type, leadId } = req.body as {
    userId?: string
    title?: string
    message?: string
    url?: string
    type?: string
    leadId?: string
  }

  if (!userId || !title || !message) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ error: 'Server not configured' })
  }

  const result = await notifyOrgUser({
    supabase,
    orgId: auth.orgId,
    userId,
    title,
    message,
    url,
    type,
    leadId,
  })

  if (!result.ok) {
    const status = result.error === 'User not in organisation' ? 403 : 500
    return res.status(status).json({ error: result.error ?? 'Failed to notify user' })
  }

  return res.status(200).json({
    success: true,
    alert: result.alert,
    whatsapp: result.alert,
    note:
      type === 'lead_assigned'
        ? 'In-app notification only; assignment WhatsApp is sent separately via tech_assignment.'
        : undefined,
  })
}

/** Alert managers after a new unassigned lead is created from the app. */
async function handleNewLeadAlert(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { leadId } = req.body as { leadId?: string }
  if (!leadId) {
    return res.status(400).json({ error: 'Missing leadId' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ error: 'Server not configured' })
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, org_id, name, service_type, status')
    .eq('id', leadId)
    .maybeSingle()

  if (leadError || !lead) {
    return res.status(404).json({ error: 'Lead not found' })
  }
  if (lead.org_id !== auth.orgId) {
    return res.status(403).json({ error: 'Lead is outside your organisation' })
  }

  try {
    const alertsEnabled = await isFeatureEnabledForOrg(lead.org_id, 'manager_new_lead_alerts')
    if (!alertsEnabled) {
      return res.status(200).json({ skipped: true, reason: 'manager_new_lead_alerts_disabled' })
    }
    const result = await notifyManagersNewLead(lead)
    if (result.skipped) {
      return res.status(200).json({ skipped: true, reason: result.skipped })
    }
    return res.status(200).json({ success: true, notified: result.notified })
  } catch (err) {
    console.error('New lead alert failed:', err)
    return res.status(500).json({ error: 'Failed to alert managers' })
  }
}

async function handleQuoteCreate(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  if (!['manager', 'platform_admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only managers can send quotes' })
  }

  const featureEnabled = await isFeatureEnabledForOrg(auth.orgId, 'quote_esign')
  if (!featureEnabled) {
    return res.status(403).json({ error: 'Quote acceptance is disabled for this franchise' })
  }

  const {
    leadId,
    customerName,
    customerEmail,
    customerPhone,
    serviceType,
    scope,
    terms,
    totalAmount,
    expiryDays,
  } = (req.body ?? {}) as {
    leadId?: string
    customerName?: string
    customerEmail?: string
    customerPhone?: string
    serviceType?: string
    scope?: string
    terms?: string
    totalAmount?: number
    expiryDays?: number
  }

  if (!leadId || !customerName || !scope || typeof totalAmount !== 'number') {
    return res.status(400).json({ error: 'Missing quote fields (leadId, customerName, scope, totalAmount)' })
  }

  try {
    const quote = await createQuote({
      orgId: auth.orgId,
      createdBy: auth.userId,
      leadId,
      customerName,
      customerEmail,
      customerPhone,
      serviceType,
      scope,
      terms,
      totalAmount,
      expiryDays,
      baseUrl: getRequestBaseUrl(req),
      orgName: auth.org.name,
      emailTemplates: auth.brand?.email_templates ?? null,
      primaryColor: auth.brand?.primary_color,
    })
    return res.status(200).json({ success: true, quote })
  } catch (err) {
    console.error('Quote create failed:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create quote' })
  }
}

async function handleQuotePublicGet(req: VercelRequest, res: VercelResponse) {
  const token = String(req.query.token ?? '').trim()
  if (!token) {
    return res.status(400).json({ error: 'Missing quote token' })
  }

  try {
    const quote = await getQuoteByToken(token)
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' })
    }

    const featureEnabled = await isFeatureEnabledForOrg(quote.org_id, 'quote_esign')
    if (!featureEnabled) {
      return res.status(403).json({ error: 'Quote acceptance is not available right now' })
    }

    const isExpired = quote.token_expires_at && new Date(quote.token_expires_at).getTime() < Date.now()
    return res.status(200).json({
      quote: {
        id: quote.id,
        status: isExpired && quote.status === 'sent' ? 'expired' : quote.status,
        customer_name: quote.customer_name,
        customer_email: quote.customer_email,
        customer_phone: quote.customer_phone,
        service_type: quote.service_type,
        scope: quote.scope,
        terms: quote.terms,
        total_amount: quote.total_amount,
        currency: quote.currency,
        token_expires_at: quote.token_expires_at,
        accepted_at: quote.accepted_at,
        sent_at: quote.sent_at,
      },
    })
  } catch (err) {
    console.error('Quote public get failed:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load quote' })
  }
}

async function handleQuotePublicAccept(req: VercelRequest, res: VercelResponse) {
  const { token, signerName, signerEmail, signatureText } = (req.body ?? {}) as {
    token?: string
    signerName?: string
    signerEmail?: string
    signatureText?: string
  }

  if (!token || !signerName || !signatureText) {
    return res.status(400).json({ error: 'Missing required fields: token, signerName, signatureText' })
  }

  try {
    const quote = await getQuoteByToken(token)
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' })
    }

    const featureEnabled = await isFeatureEnabledForOrg(quote.org_id, 'quote_esign')
    if (!featureEnabled) {
      return res.status(403).json({ error: 'Quote acceptance is not available right now' })
    }

    const forwardedFor = req.headers['x-forwarded-for']
    const ipAddress = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0]?.trim()
      : null
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null

    const result = await acceptQuoteByToken({
      token,
      signerName,
      signerEmail,
      signatureText,
      ipAddress,
      userAgent,
    })

    if (result.status === 'not_found') return res.status(404).json({ error: 'Quote not found' })
    if (result.status === 'expired') return res.status(410).json({ error: 'Quote has expired' })
    if (result.status === 'invalid_status') return res.status(409).json({ error: 'Quote cannot be signed in its current status' })

    return res.status(200).json({
      success: true,
      status: result.status,
      quote: result.quote,
    })
  } catch (err) {
    console.error('Quote public accept failed:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to accept quote' })
  }
}

async function loadOrgInvoiceSettings(orgId: string) {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('orgs')
    .select('email_templates, invoice_payment_instructions, invoice_pdf_template_path, primary_color')
    .eq('id', orgId)
    .maybeSingle()
  if (error || !data) return null
  return {
    email_templates: (data.email_templates as Record<string, string>) ?? {},
    invoice_payment_instructions: (data.invoice_payment_instructions as string) ?? null,
    invoice_pdf_template_path: (data.invoice_pdf_template_path as string) ?? null,
    primary_color: (data.primary_color as string) || '#004B93',
  }
}

async function handleInvoiceSendEmail(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  if (!['manager', 'platform_admin', 'technician'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only team members can send invoices' })
  }

  const featureEnabled = await isFeatureEnabledForOrg(auth.orgId, 'one_tap_invoice')
  if (!featureEnabled) {
    return res.status(403).json({ error: 'Invoice email is disabled for this franchise' })
  }

  const {
    leadId,
    quoteId,
    customerName,
    customerEmail,
    serviceType,
    totalAmount,
    lineItems,
    pdfStoragePath,
    senderName,
  } = (req.body ?? {}) as {
    leadId?: string
    customerName?: string
    customerEmail?: string
    serviceType?: string
    totalAmount?: number
    quoteId?: string
    lineItems?: Array<{ label: string; amount: number }>
    pdfStoragePath?: string
    senderName?: string
  }

  if (!leadId || !customerName || !customerEmail || typeof totalAmount !== 'number') {
    return res.status(400).json({
      error: 'Missing invoice fields (leadId, customerName, customerEmail, totalAmount)',
    })
  }

  const orgSettings = await loadOrgInvoiceSettings(auth.orgId)
  if (!orgSettings) {
    return res.status(500).json({ error: 'Could not load org invoice settings' })
  }

  try {
    const invoice = await createAndSendInvoice({
      orgId: auth.orgId,
      createdBy: auth.userId,
      leadId,
      quoteId,
      customerName,
      customerEmail,
      serviceType,
      totalAmount,
      lineItems,
      pdfStoragePath,
      orgName: auth.org.name,
      senderName,
      emailTemplates: orgSettings.email_templates,
      paymentInstructions: orgSettings.invoice_payment_instructions,
      orgPdfTemplatePath: orgSettings.invoice_pdf_template_path,
      primaryColor: orgSettings.primary_color || auth.brand?.primary_color,
    })
    return res.status(200).json({ success: true, invoice })
  } catch (err) {
    console.error('Invoice send failed:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send invoice' })
  }
}

async function handleInvoiceMarkPaid(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  if (!['manager', 'platform_admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only managers can mark invoices paid' })
  }

  const { invoiceId } = (req.body ?? {}) as { invoiceId?: string }
  if (!invoiceId) {
    return res.status(400).json({ error: 'Missing invoiceId' })
  }

  try {
    const invoice = await markInvoicePaid(invoiceId, auth.orgId)
    return res.status(200).json({ success: true, invoice })
  } catch (err) {
    console.error('Invoice mark paid failed:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to mark invoice paid' })
  }
}

function isContactFollowUpCronAuthorized(req: VercelRequest): boolean {
  loadLocalEnvIfNeeded()
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV !== 'production'

  const authHeader = req.headers.authorization
  if (typeof authHeader === 'string' && authHeader === `Bearer ${secret}`) return true

  const cronHeader = req.headers['x-cron-secret']
  const headerVal = Array.isArray(cronHeader) ? cronHeader[0] : cronHeader
  return headerVal === secret
}

async function handleContactFollowUpCron(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isContactFollowUpCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.status(503).json({ error: 'Server not configured' })
  }

  try {
    const result = await runContactFollowUpCron(supabase)
    let workflowPurge = { deleted: 0 }
    try {
      workflowPurge = await purgeOldWorkflowRuns(supabase)
    } catch (purgeErr) {
      console.error('[WORKFLOW_RUN_LOG_FAILED] workflow purge failed:', purgeErr)
    }
    let invoiceChase = { orgs: 0, checked: 0, sent: 0 }
    try {
      invoiceChase = await runInvoiceChaseSweep(supabase)
    } catch (chaseErr) {
      console.error('[INVOICE_CHASE_SWEEP_FAILED]', chaseErr)
    }
    return res.status(200).json({ ok: true, ...result, workflowPurge, invoiceChase })
  } catch (err) {
    console.error('contact-follow-up cron failed:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Cron failed',
    })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action ?? '').trim()

  // Public quote actions (no app session required)
  if (action === 'quote-public-get') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    return handleQuotePublicGet(req, res)
  }
  if (action === 'quote-public-accept') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    return handleQuotePublicAccept(req, res)
  }

  // CRON_SECRET — consolidated to stay under Hobby 12-function limit (see vercel.json).
  if (action === 'contact-follow-up') {
    return handleContactFollowUpCron(req, res)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { auth, reason } = await authenticateRequestDetailed(req)
  if (!auth) {
    return res.status(401).json({ error: authErrorMessage(reason) })
  }

  const ip = (req.headers['x-forwarded-for'] as string) ?? auth.userId
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  // Consolidated to stay under the Vercel Hobby 12-function limit.
  // /api/send-notification rewrites here with ?action=notify (see vercel.json).
  if (action === 'notify') {
    return handleNotify(req, res, auth)
  }
  if (action === 'new-lead-alert') {
    return handleNewLeadAlert(req, res, auth)
  }
  if (action === 'quote-create') {
    return handleQuoteCreate(req, res, auth)
  }
  if (action === 'invoice-send-email') {
    return handleInvoiceSendEmail(req, res, auth)
  }
  if (action === 'invoice-mark-paid') {
    return handleInvoiceMarkPaid(req, res, auth)
  }

  const { mode, to, assigneeId, customerName, techName, address, leadName, serviceType, leadId, dateTime, managerName } = req.body as {
    mode?: string
    to?: string
    assigneeId?: string
    customerName?: string
    techName?: string
    address?: string
    leadName?: string
    serviceType?: string
    leadId?: string
    dateTime?: string
    managerName?: string
  }

  const hasTechAssignee = mode === 'tech_assignment' && Boolean(assigneeId?.trim())

  if (!to && mode !== 'review_request' && !hasTechAssignee) {
    return res.status(400).json({ error: 'Missing required field: to' })
  }

  const supabaseAdmin = getSupabaseAdmin()

  let smsTo = to ? formatAuPhoneForSms(to) : ''

  if (mode === 'tech_assignment' && assigneeId?.trim()) {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Server not configured' })
    }
    const { data: assignee, error: assigneeError } = await supabaseAdmin
      .from('profiles')
      .select('id, org_id, phone')
      .eq('id', assigneeId.trim())
      .maybeSingle()

    if (assigneeError || !assignee) {
      return res.status(404).json({ error: 'Assignee not found' })
    }
    if (assignee.org_id !== auth.orgId) {
      return res.status(403).json({ error: 'Assignee is outside your organisation' })
    }
    if (!assignee.phone?.trim()) {
      return res.status(400).json({ error: 'Assignee has no phone on profile' })
    }
    smsTo = formatAuPhoneForSms(assignee.phone)
  }

  // Review requests: resolve phone from lead row (avoids format mismatch in phoneBelongsToOrg).
  if (mode === 'review_request') {
    if (!leadId) {
      return res.status(400).json({ error: 'Missing leadId for review_request mode' })
    }
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Server not configured' })
    }
    const { data: leadRow, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id, org_id, phone, name')
      .eq('id', leadId)
      .maybeSingle()

    if (leadError || !leadRow) {
      return res.status(404).json({ error: 'Lead not found' })
    }
    if (leadRow.org_id !== auth.orgId) {
      return res.status(403).json({ error: 'Lead is outside your organisation' })
    }
    if (!leadRow.phone?.trim()) {
      return res.status(400).json({ error: 'Lead has no phone number' })
    }
    smsTo = formatAuPhoneForSms(leadRow.phone)
  }

  if (!smsTo) {
    return res.status(400).json({ error: 'Missing required field: to' })
  }

  // Only allow texting numbers that exist on a lead/customer in the caller's org.
  // For tech_assignment / manager_alert, `to` is a team member — allow org members too.
  const isInternalMode = mode === 'tech_assignment' || mode === 'manager_alert' || mode === 'booking_scheduled'
  const allowed =
    mode === 'review_request' ||
    (isInternalMode && (await technicianInOrg(smsTo, auth.orgId))) ||
    (await phoneBelongsToOrg(smsTo, auth.orgId))

  if (!allowed) {
    return res.status(400).json({ error: 'Recipient is not a contact in your organisation' })
  }

  let reviewUrl = ''

  if (mode === 'review_request') {
    const reviewEnabled = await isFeatureEnabledForOrg(auth.orgId, 'review_requests')
    if (!reviewEnabled) {
      return res.status(403).json({ error: 'Review requests are disabled for this franchise' })
    }
    const reviewSettings = await loadOrgReviewSettings(auth.orgId)
    if (reviewSettings.migrationMissing) {
      return res.status(503).json({
        error: 'Review requests need a database update — run migration 20250627120000_review_requests.sql in Supabase.',
      })
    }
    reviewUrl = reviewSettings.google_review_url?.trim() ?? ''
    if (!reviewUrl) {
      return res.status(400).json({ error: 'Google review URL is not configured in Franchise Settings' })
    }
  } else if (!mode || (mode !== 'tech_assignment' && mode !== 'manager_alert' && mode !== 'booking_scheduled')) {
    const onTheWayEnabled = await isFeatureEnabledForOrg(auth.orgId, 'customer_ontheway_sms')
    if (!onTheWayEnabled) {
      return res.status(403).json({ error: 'Customer on-the-way SMS is disabled for this franchise' })
    }
  }

  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER

  if (!sid || !token) {
    return res.status(500).json({ error: 'Twilio env vars not configured' })
  }

  if (!isInternalMode && !from) {
    return res.status(500).json({ error: 'Twilio SMS from number not configured' })
  }

  const orgName = auth.org.name
  const platformUrl = getPlatformUrl()
  let message: string

  if (mode === 'tech_assignment') {
    if (!leadName || !serviceType) {
      return res.status(400).json({ error: 'Missing leadName or serviceType for tech_assignment mode' })
    }
    message = buildSmsFromBrand(
      auth.brand?.sms_templates,
      'tech_assignment',
      {
        'org.name': orgName,
        leadName,
        serviceType,
        appUrl: `${platformUrl}/leads`,
      },
      `${orgName}: You've been assigned {{leadName}} ({{serviceType}}). Open the app: {{appUrl}}`
    )
  } else if (mode === 'manager_alert') {
    if (!leadName || !serviceType) {
      return res.status(400).json({ error: 'Missing leadName or serviceType for manager alert' })
    }
    message = buildSmsFromBrand(
      auth.brand?.sms_templates,
      'manager_alert',
      {
        'org.name': orgName,
        leadName,
        serviceType,
        appUrl: `${platformUrl}/leads`,
      },
      `${orgName}: A new lead has been submitted — {{leadName}} ({{serviceType}}). Please review and assign a technician: {{appUrl}}`
    )
  } else if (mode === 'booking_scheduled') {
    if (!leadName || !dateTime) {
      return res.status(400).json({ error: 'Missing leadName or dateTime for booking_scheduled mode' })
    }
    message = buildSmsFromBrand(
      auth.brand?.sms_templates,
      'booking_scheduled',
      {
        'org.name': orgName,
        leadName,
        serviceType: serviceType ?? leadName,
        dateTime,
        managerName: managerName ?? 'Your manager',
        appUrl: `${platformUrl}/calendar`,
      },
      `${orgName}: {{managerName}} scheduled "{{leadName}}" on your calendar — {{dateTime}}. Open: {{appUrl}}`
    )
  } else if (mode === 'review_request') {
    if (!customerName) {
      return res.status(400).json({ error: 'Missing customerName for review_request mode' })
    }
    message = buildSmsFromBrand(
      auth.brand?.sms_templates,
      'customer_review_request',
      {
        'org.name': orgName,
        customerName,
        reviewUrl: reviewUrl!,
      },
      `Hi {{customerName}}, thanks for choosing {{org.name}}! We'd love your feedback: {{reviewUrl}}`
    )
  } else {
    if (!customerName) {
      return res.status(400).json({ error: 'Missing customerName for ETA mode' })
    }
    const mapsUrl = address?.trim()
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`
      : ''
    message = buildSmsFromBrand(
      auth.brand?.sms_templates,
      'customer_ontheway',
      {
        'org.name': orgName,
        customerName,
        techName: techName ?? 'your technician',
        mapsUrl,
      },
      mapsUrl
        ? `{{techName}} from {{org.name}} is on their way. Thank you. Track the route: {{mapsUrl}}`
        : `{{techName}} from {{org.name}} is on their way. Thank you.`
    )
  }

  if (isInternalMode) {
    const templateKey = whatsAppTemplateKeyForMode(mode!)
    const waMessage = templateKey
      ? buildEmployeeWhatsAppMessage(templateKey, message, {
          orgName,
          leadName: leadName ?? '',
          serviceType: serviceType ?? '',
          managerName: managerName ?? '',
          dateTime: dateTime ?? '',
          appUrl:
            mode === 'booking_scheduled'
              ? `${platformUrl}/calendar`
              : `${platformUrl}/leads`,
        })
      : { body: message }
    const result = await sendEmployeeAlertWithSmsFallback({
      toPhone: smsTo,
      smsBody: message,
      whatsAppMessage: waMessage,
    })
    if (result.skipped && !result.sent) {
      return res.status(503).json({ error: result.skipped })
    }
    if (!result.sent) {
      return res.status(502).json({
        error: result.error ?? 'Failed to send employee alert',
        code: result.code,
        staticTemplateEnabled:
          mode === 'tech_assignment' && isStaticAssignmentWhatsAppTemplate(),
        envAssignmentTemplateSid:
          mode === 'tech_assignment'
            ? getEmployeeWhatsAppContentSid('tech_assignment')
            : undefined,
      })
    }
    return res.status(200).json({
      success: true,
      channel: result.channel ?? 'sms',
      sid: result.sid,
      usedTemplate: Boolean(waMessage.contentSid) && result.channel === 'whatsapp',
      staticTemplate: mode === 'tech_assignment' && isStaticAssignmentWhatsAppTemplate(),
      envAssignmentTemplateSid:
        mode === 'tech_assignment'
          ? getEmployeeWhatsAppContentSid('tech_assignment')
          : undefined,
    })
  }

  const bodyParams = new URLSearchParams({ To: smsTo, From: from!, Body: message })
  const credentials = Buffer.from(`${sid}:${token}`).toString('base64')

  try {
    const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    })

    const twData = await twRes.json()

    if (!twRes.ok) {
      console.error('Twilio error:', twData)
      return res.status(502).json({ error: 'Twilio rejected the request', detail: (twData as { message?: string }).message })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('SMS send error:', err)
    return res.status(500).json({ error: 'Failed to send SMS' })
  }
}
