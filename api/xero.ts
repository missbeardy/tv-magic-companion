import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequestDetailed, authErrorMessage } from './_lib/auth.js'
import { isFeatureEnabledForOrg } from './_lib/featureSwitches.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { getPlatformUrl } from './_lib/platformUrl.js'
import {
  buildXeroAuthorizeUrl,
  buildMockTokenSet,
  createOAuthState,
  createOrUpdateXeroInvoice,
  exchangeAuthorizationCode,
  fetchXeroConnections,
  getXeroClientCredentials,
  getXeroRedirectUri,
  getXeroStateSigningSecret,
  isMockXeroConnection,
  isXeroConfigured,
  isXeroMockMode,
  parseOAuthState,
  refreshAccessToken,
  tokenNeedsRefresh,
  XERO_MOCK_CODE,
  XERO_MOCK_TENANT_ID,
  XERO_MOCK_TENANT_NAME,
  type XeroTokenSet,
} from './_lib/xero.js'
import type { XeroSyncInvoiceInput } from '../shared/xeroInvoicePayload.js'
import { buildXeroInvoicePayload } from '../shared/xeroInvoicePayload.js'
import { endOfDayIso, startOfDayIso } from '../shared/dateRangeIso.js'

type XeroAction = 'oauth-start' | 'oauth-callback' | 'status' | 'sync' | 'disconnect'

const XERO_ACTIONS: readonly XeroAction[] = [
  'oauth-start',
  'oauth-callback',
  'status',
  'sync',
  'disconnect',
]

function resolveAction(req: VercelRequest): XeroAction | null {
  const queryAction = req.query.action
  if (typeof queryAction === 'string' && (XERO_ACTIONS as readonly string[]).includes(queryAction)) {
    return queryAction as XeroAction
  }
  const path = req.url?.split('?')[0] ?? ''
  if (path.includes('xero-oauth-callback')) return 'oauth-callback'
  return null
}

function settingsRedirect(query: Record<string, string>): string {
  const params = new URLSearchParams(query)
  return `${getPlatformUrl()}/org-settings?${params.toString()}`
}

function parseLineItems(raw: unknown): XeroSyncInvoiceInput['line_items'] {
  if (!Array.isArray(raw)) return null
  return raw
    .filter((i): i is { label?: unknown; amount?: unknown } => i != null && typeof i === 'object')
    .map((i) => ({
      label: String(i.label ?? ''),
      amount: Number(i.amount) || 0,
    }))
}

async function ensureFreshTokens(org: {
  id: string
  xero_access_token: string | null
  xero_refresh_token: string | null
  xero_token_expires_at: string | null
  xero_tenant_id?: string | null
}): Promise<XeroTokenSet> {
  if (!org.xero_access_token || !org.xero_refresh_token) {
    throw new Error('Xero is not connected')
  }
  if (
    isMockXeroConnection({
      tenantId: org.xero_tenant_id,
      accessToken: org.xero_access_token,
    })
  ) {
    return {
      access_token: org.xero_access_token,
      refresh_token: org.xero_refresh_token,
      expires_at:
        org.xero_token_expires_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }
  }
  if (!tokenNeedsRefresh(org.xero_token_expires_at)) {
    return {
      access_token: org.xero_access_token,
      refresh_token: org.xero_refresh_token,
      expires_at: org.xero_token_expires_at!,
    }
  }
  const refreshed = await refreshAccessToken(org.xero_refresh_token)
  const supabase = getSupabaseAdmin()
  if (supabase) {
    await supabase
      .from('orgs')
      .update({
        xero_access_token: refreshed.access_token,
        xero_refresh_token: refreshed.refresh_token,
        xero_token_expires_at: refreshed.expires_at,
      })
      .eq('id', org.id)
  }
  return refreshed
}

async function handleOAuthStart(req: VercelRequest, res: VercelResponse) {
  if (!isXeroConfigured()) {
    return res.status(503).json({
      error:
        'Xero is not configured. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET, or XERO_MOCK=1 for local/UAT without a Xero account.',
    })
  }

  const { auth, reason } = await authenticateRequestDetailed(req)
  if (!auth) return res.status(401).json({ error: authErrorMessage(reason) })
  if (!['manager', 'platform_admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only managers can connect Xero' })
  }

  const enabled = await isFeatureEnabledForOrg(auth.orgId, 'xero_live_sync')
  if (!enabled) {
    return res.status(403).json({ error: 'Xero Live Sync is not enabled for this organisation' })
  }

  const signingSecret = getXeroStateSigningSecret()
  if (!signingSecret) {
    return res.status(503).json({ error: 'Xero signing secret unavailable' })
  }

  const state = createOAuthState(auth.orgId, signingSecret)

  // Mock: skip Xero login — bounce straight to our callback
  if (isXeroMockMode() && !getXeroClientCredentials()) {
    const params = new URLSearchParams({ code: XERO_MOCK_CODE, state })
    const url = `${getPlatformUrl()}/api/xero-oauth-callback?${params.toString()}`
    return res.status(200).json({ url, mock: true })
  }

  const creds = getXeroClientCredentials()
  if (!creds) {
    return res.status(503).json({ error: 'Xero client credentials missing' })
  }

  const url = buildXeroAuthorizeUrl({
    clientId: creds.clientId,
    redirectUri: getXeroRedirectUri(),
    state,
  })
  return res.status(200).json({ url })
}

async function handleOAuthCallback(req: VercelRequest, res: VercelResponse) {
  const signingSecret = getXeroStateSigningSecret()
  if (!signingSecret) {
    return res.redirect(302, settingsRedirect({ xero: 'error', message: 'xero_not_configured' }))
  }

  const errorParam = typeof req.query.error === 'string' ? req.query.error : null
  if (errorParam) {
    return res.redirect(
      302,
      settingsRedirect({ xero: 'error', message: errorParam.slice(0, 80) })
    )
  }

  const code = typeof req.query.code === 'string' ? req.query.code : null
  const state = typeof req.query.state === 'string' ? req.query.state : null
  if (!code || !state) {
    return res.redirect(302, settingsRedirect({ xero: 'error', message: 'missing_code' }))
  }

  const parsed = parseOAuthState(state, signingSecret)
  if ('error' in parsed) {
    return res.redirect(
      302,
      settingsRedirect({ xero: 'error', message: parsed.error.slice(0, 80) })
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res.redirect(302, settingsRedirect({ xero: 'error', message: 'server_misconfigured' }))
  }

  try {
    const enabled = await isFeatureEnabledForOrg(parsed.orgId, 'xero_live_sync')
    if (!enabled) {
      return res.redirect(302, settingsRedirect({ xero: 'error', message: 'feature_disabled' }))
    }

    const useMock = isXeroMockMode() && code === XERO_MOCK_CODE

    let tenantId: string
    let tenantName: string
    let tokens: XeroTokenSet

    if (useMock) {
      tokens = buildMockTokenSet(parsed.orgId)
      tenantId = XERO_MOCK_TENANT_ID
      tenantName = XERO_MOCK_TENANT_NAME
    } else {
      tokens = await exchangeAuthorizationCode(code)
      const connections = await fetchXeroConnections(tokens.access_token)
      if (connections.length === 0) {
        return res.redirect(302, settingsRedirect({ xero: 'error', message: 'no_tenant' }))
      }
      const preferred =
        connections.find((c) => /demo company/i.test(c.tenantName)) ?? connections[0]
      tenantId = preferred.tenantId
      tenantName = preferred.tenantName
    }

    await supabase
      .from('orgs')
      .update({
        xero_tenant_id: tenantId,
        xero_tenant_name: tenantName,
        xero_access_token: tokens.access_token,
        xero_refresh_token: tokens.refresh_token,
        xero_token_expires_at: tokens.expires_at,
        xero_connected_at: new Date().toISOString(),
      })
      .eq('id', parsed.orgId)

    return res.redirect(302, settingsRedirect({ xero: 'connected' }))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'connect_failed'
    console.error('Xero OAuth callback failed', err)
    return res.redirect(
      302,
      settingsRedirect({ xero: 'error', message: message.slice(0, 80) })
    )
  }
}

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  const { auth, reason } = await authenticateRequestDetailed(req)
  if (!auth) return res.status(401).json({ error: authErrorMessage(reason) })

  const enabled = await isFeatureEnabledForOrg(auth.orgId, 'xero_live_sync')
  if (!enabled) {
    return res.status(403).json({ error: 'Xero Live Sync is not enabled for this organisation' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return res.status(503).json({ error: 'Server database is not configured' })

  const { data: org, error } = await supabase
    .from('orgs')
    .select('xero_tenant_id, xero_tenant_name, xero_connected_at, xero_token_expires_at, xero_access_token')
    .eq('id', auth.orgId)
    .single()

  if (error || !org) {
    return res.status(500).json({ error: 'Could not load Xero connection status' })
  }

  const connected = Boolean(org.xero_tenant_id)
  const mock =
    isXeroMockMode() ||
    isMockXeroConnection({
      tenantId: org.xero_tenant_id,
      accessToken: org.xero_access_token,
    })
  return res.status(200).json({
    connected,
    configured: isXeroConfigured(),
    mock,
    tenantName: org.xero_tenant_name,
    connectedAt: org.xero_connected_at,
  })
}

async function handleDisconnect(req: VercelRequest, res: VercelResponse) {
  const { auth, reason } = await authenticateRequestDetailed(req)
  if (!auth) return res.status(401).json({ error: authErrorMessage(reason) })
  if (!['manager', 'platform_admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only managers can disconnect Xero' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return res.status(503).json({ error: 'Server database is not configured' })

  await supabase
    .from('orgs')
    .update({
      xero_tenant_id: null,
      xero_tenant_name: null,
      xero_access_token: null,
      xero_refresh_token: null,
      xero_token_expires_at: null,
      xero_connected_at: null,
    })
    .eq('id', auth.orgId)

  return res.status(200).json({ disconnected: true })
}

async function handleSync(req: VercelRequest, res: VercelResponse) {
  const { auth, reason } = await authenticateRequestDetailed(req)
  if (!auth) return res.status(401).json({ error: authErrorMessage(reason) })
  if (!['manager', 'platform_admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only managers can sync to Xero' })
  }

  const enabled = await isFeatureEnabledForOrg(auth.orgId, 'xero_live_sync')
  if (!enabled) {
    return res.status(403).json({ error: 'Xero Live Sync is not enabled for this organisation' })
  }

  if (!isXeroConfigured()) {
    return res.status(503).json({ error: 'Xero is not configured on the server' })
  }

  let from: string | undefined
  let to: string | undefined
  try {
    const body =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as { from?: string; to?: string })
        : {}
    from = body.from
    to = body.to
  } catch {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  if (!from || !to || from > to) {
    return res.status(400).json({ error: 'Provide from and to dates (YYYY-MM-DD)' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return res.status(503).json({ error: 'Server database is not configured' })

  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select(
      'id, gst_registered, accounting_account_code, xero_tenant_id, xero_access_token, xero_refresh_token, xero_token_expires_at'
    )
    .eq('id', auth.orgId)
    .single()

  if (orgError || !org) {
    return res.status(500).json({ error: 'Could not load organisation' })
  }
  if (!org.xero_tenant_id) {
    return res.status(400).json({ error: 'Connect Xero before syncing' })
  }

  let tokens: XeroTokenSet
  try {
    tokens = await ensureFreshTokens(org)
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : 'Xero token refresh failed — reconnect Xero',
    })
  }

  const mockSync = isMockXeroConnection({
    tenantId: org.xero_tenant_id,
    accessToken: tokens.access_token,
  })

  const { data: rows, error: invError } = await supabase
    .from('invoices')
    .select(
      'id, customer_name, customer_email, invoice_number, sent_at, total_amount, line_items, status, paid_at, xero_invoice_id'
    )
    .eq('org_id', auth.orgId)
    .not('sent_at', 'is', null)
    .gte('sent_at', startOfDayIso(from))
    .lte('sent_at', endOfDayIso(to))
    .order('sent_at', { ascending: true })

  if (invError) {
    return res.status(500).json({ error: 'Could not load invoices for sync' })
  }

  const accountCode = (org.accounting_account_code as string | null)?.trim() || '200'
  const gstRegistered = org.gst_registered !== false

  let synced = 0
  let skipped = 0
  const errors: Array<{ invoice_number: string; error: string }> = []

  for (const row of rows ?? []) {
    if (!row.sent_at) {
      skipped += 1
      continue
    }
    if (row.xero_invoice_id) {
      skipped += 1
      continue
    }

    const invoice: XeroSyncInvoiceInput = {
      customer_name: row.customer_name,
      customer_email: row.customer_email,
      invoice_number: row.invoice_number,
      sent_at: row.sent_at,
      total_amount: Number(row.total_amount) || 0,
      line_items: parseLineItems(row.line_items),
      status: row.status,
      paid_at: row.paid_at,
    }

    try {
      let invoiceId: string
      if (mockSync) {
        // Validate payload locally; do not call Xero
        buildXeroInvoicePayload(invoice, { gstRegistered, accountCode })
        invoiceId = `mock-${row.id}`
      } else {
        const result = await createOrUpdateXeroInvoice({
          accessToken: tokens.access_token,
          tenantId: org.xero_tenant_id,
          invoice,
          gstRegistered,
          accountCode,
        })
        invoiceId = result.invoiceId
      }
      await supabase
        .from('invoices')
        .update({
          xero_invoice_id: invoiceId,
          xero_synced_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('org_id', auth.orgId)
      synced += 1
    } catch (err) {
      errors.push({
        invoice_number: row.invoice_number,
        error: err instanceof Error ? err.message : 'Sync failed',
      })
    }
  }

  return res.status(200).json({
    synced,
    skipped,
    errors,
    total: rows?.length ?? 0,
    mock: mockSync,
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = resolveAction(req)
  if (!action) {
    return res.status(400).json({
      error: 'Unknown action. Use oauth-start, oauth-callback, status, sync, or disconnect.',
    })
  }

  switch (action) {
    case 'oauth-callback':
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      return handleOAuthCallback(req, res)
    case 'oauth-start':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      return handleOAuthStart(req, res)
    case 'status':
      if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
      }
      return handleStatus(req, res)
    case 'disconnect':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      return handleDisconnect(req, res)
    case 'sync':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      return handleSync(req, res)
    default:
      return res.status(400).json({ error: 'Unhandled action' })
  }
}
