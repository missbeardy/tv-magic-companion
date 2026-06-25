import { randomBytes } from 'node:crypto'
import { buildQuoteEmailFromBrand, nl2brHtml } from './emailTemplates.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { getPlatformUrl } from './platformUrl.js'

export interface QuoteCreateInput {
  orgId: string
  createdBy: string
  leadId: string
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  serviceType?: string | null
  scope: string
  terms?: string | null
  totalAmount: number
  expiryDays?: number
  baseUrl?: string | null
  orgName?: string
  senderName?: string
  emailTemplates?: Record<string, string> | null
  primaryColor?: string
}

export interface QuoteAcceptInput {
  token: string
  signerName: string
  signerEmail?: string | null
  signatureText: string
  ipAddress?: string | null
  userAgent?: string | null
}

function buildQuoteToken(): string {
  return randomBytes(24).toString('hex')
}

function normalizeExpiryDays(days: number | undefined): number {
  if (!days || Number.isNaN(days)) return 7
  return Math.min(30, Math.max(1, Math.round(days)))
}

function resolveBaseUrl(baseUrl?: string | null): string {
  if (baseUrl && /^https?:\/\//i.test(baseUrl)) {
    return baseUrl.replace(/\/$/, '')
  }
  return getPlatformUrl()
}

async function sendQuoteEmail(params: {
  customerEmail: string
  customerName: string
  acceptanceUrl: string
  totalAmount: number
  scope: string
  terms?: string | null
  serviceType?: string | null
  orgName?: string
  senderName?: string
  emailTemplates?: Record<string, string> | null
  primaryColor?: string
}): Promise<{ emailSent: boolean; emailMessage: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { emailSent: false, emailMessage: 'Quote email not sent (RESEND_API_KEY is missing).' }
  }

  const fromAddress = process.env.QUOTE_EMAIL_FROM || process.env.EMAIL_FROM || 'noreply@tv-magic-companion.com'
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const serviceType = params.serviceType?.trim() ?? ''
    const { subject, html } = buildQuoteEmailFromBrand(params.emailTemplates, {
      'org.name': params.orgName?.trim() ?? '',
      customerName: params.customerName,
      acceptanceUrl: params.acceptanceUrl,
      totalAmount: `AUD ${Number(params.totalAmount).toFixed(2)}`,
      serviceType,
      serviceTypeLine: serviceType ? ` for ${serviceType}` : '',
      scopeHtml: nl2brHtml(params.scope),
      termsBlock: params.terms?.trim()
        ? `<p><strong>Terms:</strong><br/>${nl2brHtml(params.terms)}</p>`
        : '',
      senderBlock: params.senderName?.trim()
        ? `<p>Prepared by: ${params.senderName.trim()}</p>`
        : '',
      primaryColor: params.primaryColor?.trim() || '#004B93',
    })

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: params.customerEmail,
      subject,
      html,
    })
    if (error) throw new Error(error.message)
    return { emailSent: true, emailMessage: `Quote email sent to ${params.customerEmail} from ${fromAddress}.` }
  } catch (err) {
    console.error('Quote email failed:', err)
    return { emailSent: false, emailMessage: 'Quote created, but email delivery failed. Share the link manually.' }
  }
}

export async function createQuote(input: QuoteCreateInput) {
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Server not configured')

  const expiryDays = normalizeExpiryDays(input.expiryDays)
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
  const token = buildQuoteToken()

  const { data, error } = await supabase
    .from('quotes')
    .insert({
      org_id: input.orgId,
      lead_id: input.leadId,
      created_by: input.createdBy,
      status: 'sent',
      customer_name: input.customerName,
      customer_email: input.customerEmail ?? null,
      customer_phone: input.customerPhone ?? null,
      service_type: input.serviceType ?? null,
      scope: input.scope.trim(),
      terms: input.terms?.trim() || null,
      total_amount: input.totalAmount,
      currency: 'AUD',
      public_token: token,
      token_expires_at: expiresAt,
      sent_at: new Date().toISOString(),
    })
    .select(
      'id, org_id, lead_id, status, customer_name, customer_email, customer_phone, service_type, scope, terms, total_amount, currency, token_expires_at, sent_at, created_at, public_token'
    )
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create quote')
  }

  const acceptanceUrl = `${resolveBaseUrl(input.baseUrl)}/quote/${data.public_token}`

  let emailSent = false
  let emailMessage = 'No customer email on lead; share the link manually.'
  if (input.customerEmail?.trim()) {
    const emailResult = await sendQuoteEmail({
      customerEmail: input.customerEmail.trim(),
      customerName: input.customerName,
      acceptanceUrl,
      totalAmount: input.totalAmount,
      scope: input.scope,
      terms: input.terms,
      serviceType: input.serviceType,
      orgName: input.orgName,
      senderName: input.senderName,
      emailTemplates: input.emailTemplates,
      primaryColor: input.primaryColor,
    })
    emailSent = emailResult.emailSent
    emailMessage = emailResult.emailMessage
  }

  return {
    ...data,
    acceptance_url: acceptanceUrl,
    email_sent: emailSent,
    email_message: emailMessage,
  }
}

export async function getQuoteByToken(token: string) {
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Server not configured')

  const { data, error } = await supabase
    .from('quotes')
    .select(
      'id, org_id, lead_id, status, customer_name, customer_email, customer_phone, service_type, scope, terms, total_amount, currency, token_expires_at, sent_at, accepted_at, created_at, public_token'
    )
    .eq('public_token', token)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function acceptQuoteByToken(input: QuoteAcceptInput) {
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Server not configured')

  const quote = await getQuoteByToken(input.token)
  if (!quote) return { status: 'not_found' as const }

  if (quote.status === 'accepted') {
    return { status: 'already_accepted' as const, quote }
  }
  if (quote.status !== 'sent') {
    return { status: 'invalid_status' as const, quote }
  }
  if (quote.token_expires_at && new Date(quote.token_expires_at).getTime() < Date.now()) {
    await supabase
      .from('quotes')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', quote.id)
      .eq('status', 'sent')
    return { status: 'expired' as const, quote }
  }

  const acceptedAt = new Date().toISOString()
  const { error: quoteUpdateError } = await supabase
    .from('quotes')
    .update({
      status: 'accepted',
      accepted_at: acceptedAt,
      updated_at: acceptedAt,
    })
    .eq('id', quote.id)
    .eq('status', 'sent')

  if (quoteUpdateError) {
    throw new Error(quoteUpdateError.message)
  }

  const { error: signatureError } = await supabase
    .from('quote_signatures')
    .upsert(
      {
        quote_id: quote.id,
        org_id: quote.org_id,
        signer_name: input.signerName.trim(),
        signer_email: input.signerEmail?.trim() || null,
        signature_text: input.signatureText.trim(),
        signed_at: acceptedAt,
        ip_address: input.ipAddress ?? null,
        user_agent: input.userAgent ?? null,
      },
      { onConflict: 'quote_id' }
    )

  if (signatureError) {
    throw new Error(signatureError.message)
  }

  const updatedQuote = await getQuoteByToken(input.token)
  return { status: 'accepted' as const, quote: updatedQuote }
}
