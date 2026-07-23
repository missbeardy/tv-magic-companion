import { afterEach, describe, expect, it } from 'vitest'
import {
  buildXeroInvoicePayload,
  formatXeroApiDate,
  xeroApiTaxType,
} from '../shared/xeroInvoicePayload'
import {
  createOAuthState,
  isMockXeroConnection,
  isXeroMockMode,
  parseOAuthState,
  tokenNeedsRefresh,
  XERO_MOCK_TENANT_ID,
} from '../api/_lib/xero'

describe('xeroInvoicePayload', () => {
  const baseInvoice = {
    customer_name: 'Jane Smith',
    customer_email: 'jane@example.com',
    invoice_number: 'INV-1001',
    sent_at: '2026-07-01T10:00:00.000Z',
    total_amount: 220,
    line_items: [
      { label: 'Wall mount', amount: 120 },
      { label: 'Cable run', amount: 100 },
    ],
    status: 'sent',
    paid_at: null,
  }

  it('maps GST tax types for AU API', () => {
    expect(xeroApiTaxType(true)).toBe('OUTPUT')
    expect(xeroApiTaxType(false)).toBe('BASEXCLUDED')
  })

  it('builds tax-inclusive ACCREC payload with one line per item', () => {
    const payload = buildXeroInvoicePayload(baseInvoice, {
      gstRegistered: true,
      accountCode: '200',
    })
    expect(payload.Type).toBe('ACCREC')
    expect(payload.LineAmountTypes).toBe('Inclusive')
    expect(payload.Status).toBe('AUTHORISED')
    expect(payload.InvoiceNumber).toBe('INV-1001')
    expect(payload.Contact).toEqual({
      Name: 'Jane Smith',
      EmailAddress: 'jane@example.com',
    })
    expect(payload.LineItems).toHaveLength(2)
    expect(payload.LineItems[0]).toMatchObject({
      Description: 'Wall mount',
      Quantity: 1,
      UnitAmount: 120,
      AccountCode: '200',
      TaxType: 'OUTPUT',
    })
    expect(payload.Date).toBe(formatXeroApiDate(baseInvoice.sent_at))
  })

  it('falls back to a single line from total when line_items empty', () => {
    const payload = buildXeroInvoicePayload(
      { ...baseInvoice, line_items: [] },
      { gstRegistered: false, accountCode: '  ' }
    )
    expect(payload.LineItems).toEqual([
      {
        Description: 'Invoice INV-1001',
        Quantity: 1,
        UnitAmount: 220,
        AccountCode: '200',
        TaxType: 'BASEXCLUDED',
      },
    ])
  })

  it('notes paid invoices in Reference without Status PAID', () => {
    const payload = buildXeroInvoicePayload(
      { ...baseInvoice, status: 'paid', paid_at: '2026-07-02T00:00:00.000Z' },
      { gstRegistered: true, accountCode: '200' }
    )
    expect(payload.Status).toBe('AUTHORISED')
    expect(payload.Reference).toContain('paid in FieldBourne')
  })
})

describe('xero OAuth state helpers', () => {
  const secret = 'test-client-secret'

  it('round-trips a signed state', () => {
    const state = createOAuthState('org-123', secret, 1_000_000)
    const parsed = parseOAuthState(state, secret, 1_000_000)
    expect(parsed).toEqual({ orgId: 'org-123' })
  })

  it('rejects expired state', () => {
    const state = createOAuthState('org-123', secret, 1_000_000)
    const parsed = parseOAuthState(state, secret, 1_000_000 + 16 * 60 * 1000)
    expect(parsed).toEqual({ error: 'OAuth state expired — try Connect again' })
  })

  it('rejects tampered state', () => {
    const state = createOAuthState('org-123', secret)
    const [payload] = state.split('.')
    const parsed = parseOAuthState(`${payload}.deadbeef`, secret)
    expect(parsed).toMatchObject({ error: expect.stringContaining('signature') })
  })

  it('detects tokens that need refresh', () => {
    expect(tokenNeedsRefresh(null)).toBe(true)
    expect(tokenNeedsRefresh(new Date(Date.now() + 60_000).toISOString())).toBe(true)
    expect(tokenNeedsRefresh(new Date(Date.now() + 10 * 60_000).toISOString())).toBe(false)
  })

  it('detects mock connections', () => {
    expect(isMockXeroConnection({ tenantId: XERO_MOCK_TENANT_ID })).toBe(true)
    expect(isMockXeroConnection({ accessToken: 'xero-mock-access:org' })).toBe(true)
    expect(isMockXeroConnection({ tenantId: 'real', accessToken: 'tok' })).toBe(false)
  })
})

describe('xero mock env flag', () => {
  const prev = process.env.XERO_MOCK

  afterEach(() => {
    if (prev === undefined) delete process.env.XERO_MOCK
    else process.env.XERO_MOCK = prev
  })

  it('reads XERO_MOCK truthy values', () => {
    process.env.XERO_MOCK = '1'
    expect(isXeroMockMode()).toBe(true)
    process.env.XERO_MOCK = 'true'
    expect(isXeroMockMode()).toBe(true)
    process.env.XERO_MOCK = '0'
    expect(isXeroMockMode()).toBe(false)
  })
})
