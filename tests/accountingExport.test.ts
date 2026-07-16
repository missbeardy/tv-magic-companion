import { describe, expect, it } from 'vitest'
import {
  buildXeroSalesCsv,
  deriveDueDate,
  escapeCsvCell,
  formatCsvDate,
  xeroTaxType,
  type AccountingExportInvoice,
} from '../src/lib/accountingExport'

const baseInvoice = (overrides: Partial<AccountingExportInvoice> = {}): AccountingExportInvoice => ({
  customer_name: 'Jane Smith',
  customer_email: 'jane@example.com',
  invoice_number: 'INV-1001',
  sent_at: '2026-07-01T10:00:00.000Z',
  total_amount: 220,
  line_items: [
    { label: 'TV mount', amount: 180 },
    { label: 'Cable hide', amount: 40 },
  ],
  ...overrides,
})

describe('escapeCsvCell', () => {
  it('passes through plain values', () => {
    expect(escapeCsvCell('hello')).toBe('hello')
    expect(escapeCsvCell(12.5)).toBe('12.5')
  })

  it('quotes commas, quotes, and newlines', () => {
    expect(escapeCsvCell('Smith, Jane')).toBe('"Smith, Jane"')
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"')
  })
})

describe('formatCsvDate / deriveDueDate', () => {
  it('formats as DD/MM/YYYY', () => {
    expect(formatCsvDate(new Date(2026, 6, 1))).toBe('01/07/2026')
  })

  it('due date is sent_at + 14 days', () => {
    const due = deriveDueDate('2026-07-01T10:00:00.000Z')
    expect(formatCsvDate(due)).toBe(formatCsvDate(new Date('2026-07-15T10:00:00.000Z')))
  })
})

describe('xeroTaxType', () => {
  it('uses GST on Income when registered', () => {
    expect(xeroTaxType(true)).toBe('GST on Income')
  })

  it('uses BAS Excluded when not registered', () => {
    expect(xeroTaxType(false)).toBe('BAS Excluded')
  })
})

describe('buildXeroSalesCsv', () => {
  it('emits header and one row per line item', () => {
    const csv = buildXeroSalesCsv([baseInvoice()], {
      gstRegistered: true,
      accountCode: '200',
    })
    const lines = csv.trim().split(/\r?\n/)
    expect(lines[0]).toBe(
      'ContactName,EmailAddress,InvoiceNumber,InvoiceDate,DueDate,Description,Quantity,UnitAmount,AccountCode,TaxType'
    )
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('Jane Smith')
    expect(lines[1]).toContain('INV-1001')
    expect(lines[1]).toContain('TV mount')
    expect(lines[1]).toContain(',180,')
    expect(lines[1]).toContain('GST on Income')
    expect(lines[2]).toContain('Cable hide')
    expect(lines[2]).toContain(',40,')
  })

  it('falls back to total_amount when line_items empty', () => {
    const csv = buildXeroSalesCsv(
      [baseInvoice({ line_items: null, total_amount: 99.5 })],
      { gstRegistered: false, accountCode: '260' }
    )
    const lines = csv.trim().split(/\r?\n/)
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('Invoice INV-1001')
    expect(lines[1]).toContain(',99.5,')
    expect(lines[1]).toContain(',260,')
    expect(lines[1]).toContain('BAS Excluded')
  })

  it('escapes customer names with commas', () => {
    const csv = buildXeroSalesCsv(
      [baseInvoice({ customer_name: 'Smith, Jane', line_items: [{ label: 'Job', amount: 10 }] })],
      { gstRegistered: true, accountCode: '200' }
    )
    expect(csv).toContain('"Smith, Jane"')
  })

  it('defaults blank account code to 200', () => {
    const csv = buildXeroSalesCsv(
      [baseInvoice({ line_items: [{ label: 'Job', amount: 10 }] })],
      { gstRegistered: true, accountCode: '   ' }
    )
    expect(csv).toContain(',200,GST on Income')
  })
})
