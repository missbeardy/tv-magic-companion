import { createHmac, timingSafeEqual } from 'node:crypto'
import { getPlatformUrl } from './platformUrl.js'
import {
  buildXeroInvoicePayload,
  type XeroSyncInvoiceInput,
} from '../../shared/xeroInvoicePayload.js'

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize'
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections'
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

const XERO_SCOPES = [
  'openid',
  'profile',
  'email',
  'accounting.transactions',
  'accounting.contacts',
  'offline_access',
].join(' ')

const STATE_TTL_MS = 15 * 60 * 1000

export interface XeroTokenSet {
  access_token: string
  refresh_token: string
  expires_at: string
}

export interface XeroConnection {
  tenantId: string
  tenantName: string
}

/** Dev/UAT without a real Xero account — set XERO_MOCK=1 (or true). */
export function isXeroMockMode(): boolean {
  const v = process.env.XERO_MOCK?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export const XERO_MOCK_CODE = 'xero-mock-code'
export const XERO_MOCK_TENANT_ID = 'xero-mock-tenant'
export const XERO_MOCK_TENANT_NAME = 'Demo Company (mock)'
export const XERO_MOCK_ACCESS_PREFIX = 'xero-mock-access:'

export function isXeroConfigured(): boolean {
  return Boolean(getXeroClientCredentials()) || isXeroMockMode()
}

/** Secret used to sign OAuth state (real client secret, or mock fallback). */
export function getXeroStateSigningSecret(): string | null {
  const creds = getXeroClientCredentials()
  if (creds) return creds.clientSecret
  if (isXeroMockMode()) {
    return process.env.XERO_STATE_SECRET?.trim() || 'xero-mock-dev-secret'
  }
  return null
}

export function isMockXeroConnection(opts: {
  tenantId?: string | null
  accessToken?: string | null
}): boolean {
  if (opts.tenantId === XERO_MOCK_TENANT_ID) return true
  if (opts.accessToken?.startsWith(XERO_MOCK_ACCESS_PREFIX)) return true
  return false
}

export function buildMockTokenSet(orgId: string): XeroTokenSet {
  return {
    access_token: `${XERO_MOCK_ACCESS_PREFIX}${orgId}`,
    refresh_token: `xero-mock-refresh:${orgId}`,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }
}

export function getXeroClientCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.XERO_CLIENT_ID?.trim()
  const clientSecret = process.env.XERO_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export function getXeroRedirectUri(): string {
  const explicit = process.env.XERO_REDIRECT_URI?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  return `${getPlatformUrl()}/api/xero-oauth-callback`
}

function stateSecret(signingSecret: string): string {
  return process.env.XERO_STATE_SECRET?.trim() || signingSecret
}

function b64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64url')
}

function signStatePayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/** Signed OAuth state: orgId + expiry (no DB round-trip). */
export function createOAuthState(orgId: string, signingSecret: string, now = Date.now()): string {
  const body = JSON.stringify({ orgId, exp: now + STATE_TTL_MS })
  const payload = b64url(body)
  const sig = signStatePayload(payload, stateSecret(signingSecret))
  return `${payload}.${sig}`
}

export function parseOAuthState(
  state: string,
  signingSecret: string,
  now = Date.now()
): { orgId: string } | { error: string } {
  const [payload, sig] = state.split('.')
  if (!payload || !sig) return { error: 'Invalid OAuth state' }
  const expected = signStatePayload(payload, stateSecret(signingSecret))
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { error: 'Invalid OAuth state signature' }
    }
  } catch {
    return { error: 'Invalid OAuth state signature' }
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      orgId?: string
      exp?: number
    }
    if (!parsed.orgId || typeof parsed.exp !== 'number') {
      return { error: 'Invalid OAuth state payload' }
    }
    if (parsed.exp < now) return { error: 'OAuth state expired — try Connect again' }
    return { orgId: parsed.orgId }
  } catch {
    return { error: 'Invalid OAuth state payload' }
  }
}

export function buildXeroAuthorizeUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: XERO_SCOPES,
    state: opts.state,
  })
  return `${XERO_AUTH_URL}?${params.toString()}`
}

async function exchangeToken(body: URLSearchParams): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const creds = getXeroClientCredentials()
  if (!creds) throw new Error('Xero is not configured (XERO_CLIENT_ID / XERO_CLIENT_SECRET)')

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const json = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!res.ok || !json.access_token || !json.refresh_token) {
    throw new Error(
      json.error_description || json.error || `Xero token exchange failed (${res.status})`
    )
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in ?? 1800,
  }
}

export async function exchangeAuthorizationCode(code: string): Promise<XeroTokenSet> {
  const tokens = await exchangeToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getXeroRedirectUri(),
    })
  )
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<XeroTokenSet> {
  const tokens = await exchangeToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
  )
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }
}

export async function fetchXeroConnections(accessToken: string): Promise<XeroConnection[]> {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  const json = (await res.json()) as Array<{
    tenantId?: string
    tenantName?: string
  }>
  if (!res.ok || !Array.isArray(json)) {
    throw new Error(`Failed to list Xero connections (${res.status})`)
  }
  return json
    .filter((c): c is { tenantId: string; tenantName?: string } => Boolean(c.tenantId))
    .map((c) => ({
      tenantId: c.tenantId,
      tenantName: c.tenantName?.trim() || 'Xero organisation',
    }))
}

export async function xeroAccountingFetch(
  path: string,
  opts: {
    accessToken: string
    tenantId: string
    method?: 'GET' | 'POST' | 'PUT'
    body?: unknown
  }
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(`${XERO_API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Xero-tenant-id': opts.tenantId,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { ok: res.ok, status: res.status, json }
}

export function tokenNeedsRefresh(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return true
  const t = new Date(expiresAt).getTime()
  if (Number.isNaN(t)) return true
  // Refresh 2 minutes early
  return t <= now + 2 * 60 * 1000
}

export async function createOrUpdateXeroInvoice(opts: {
  accessToken: string
  tenantId: string
  invoice: XeroSyncInvoiceInput
  gstRegistered: boolean
  accountCode: string
}): Promise<{ invoiceId: string }> {
  const payload = buildXeroInvoicePayload(opts.invoice, {
    gstRegistered: opts.gstRegistered,
    accountCode: opts.accountCode,
  })

  // Prefer update-by-number when the invoice already exists in Xero
  const existing = await xeroAccountingFetch(
    `/Invoices/${encodeURIComponent(opts.invoice.invoice_number)}`,
    { accessToken: opts.accessToken, tenantId: opts.tenantId }
  )
  if (existing.ok) {
    const invoices = (existing.json as { Invoices?: Array<{ InvoiceID?: string }> })?.Invoices
    const existingId = invoices?.[0]?.InvoiceID
    if (existingId) {
      const update = await xeroAccountingFetch(`/Invoices/${existingId}`, {
        accessToken: opts.accessToken,
        tenantId: opts.tenantId,
        method: 'POST',
        body: { Invoices: [{ ...payload, InvoiceID: existingId }] },
      })
      if (!update.ok) {
        const msg =
          (update.json as { Message?: string })?.Message ||
          `Xero invoice update failed (${update.status})`
        throw new Error(msg)
      }
      return { invoiceId: existingId }
    }
  }

  const create = await xeroAccountingFetch('/Invoices', {
    accessToken: opts.accessToken,
    tenantId: opts.tenantId,
    method: 'POST',
    body: { Invoices: [payload] },
  })
  if (!create.ok) {
    const elements = (create.json as { Elements?: Array<{ ValidationErrors?: Array<{ Message?: string }> }> })
      ?.Elements
    const validation = elements?.[0]?.ValidationErrors?.[0]?.Message
    const msg =
      validation ||
      (create.json as { Message?: string })?.Message ||
      `Xero invoice create failed (${create.status})`
    throw new Error(msg)
  }
  const createdId = (create.json as { Invoices?: Array<{ InvoiceID?: string }> })?.Invoices?.[0]
    ?.InvoiceID
  if (!createdId) throw new Error('Xero created invoice but returned no InvoiceID')
  return { invoiceId: createdId }
}

export { buildXeroInvoicePayload }
