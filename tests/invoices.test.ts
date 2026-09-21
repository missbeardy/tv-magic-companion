import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseAdmin } from '../api/_lib/supabaseAdmin'
import { sendTransactionalEmail } from '../api/_lib/sendTransactionalEmail'
import {
  collectPdfAttachments,
  createAndSendInvoice,
  invoicePdfPathBelongsToOrg,
} from '../api/_lib/invoices'

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: vi.fn(),
}))
vi.mock('../api/_lib/sendTransactionalEmail.js', () => ({
  sendTransactionalEmail: vi.fn(),
}))
vi.mock('../api/_lib/analytics.js', () => ({
  track: vi.fn(),
}))
vi.mock('../api/_lib/sentry.js', () => ({
  captureServerException: vi.fn(),
}))
vi.mock('../api/_lib/reviewRequest.js', () => ({
  maybeSendReviewOnInvoicePaid: vi.fn(),
}))

const mockAdmin = vi.mocked(getSupabaseAdmin)
const mockSendEmail = vi.mocked(sendTransactionalEmail)

function invoiceRow() {
  return {
    id: 'inv-1',
    org_id: 'org-a',
    lead_id: 'lead-1',
    invoice_number: 'INV-2026-0001',
    status: 'sent',
    total_amount: 180,
    gst_amount: 16.36,
    currency: 'AUD',
    customer_name: 'Jane',
    customer_email: 'jane@example.com',
    sent_at: '2026-09-16T00:00:00Z',
    paid_at: null,
    public_token: 'tok',
  }
}

function mockInvoiceAdmin(download: ReturnType<typeof vi.fn>) {
  const row = invoiceRow()
  mockAdmin.mockReturnValue({
    from: (table: string) => {
      if (table !== 'invoices') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            like: async () => ({ count: 0, error: null }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: row, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
          }),
        }),
        delete: () => ({ eq: async () => ({}) }),
      }
    },
    storage: {
      from: () => ({ download }),
    },
  } as never)
}

describe('invoicePdfPathBelongsToOrg', () => {
  it('allows empty paths and the caller org prefix', () => {
    expect(invoicePdfPathBelongsToOrg('org-a', null)).toBe(true)
    expect(invoicePdfPathBelongsToOrg('org-a', '  ')).toBe(true)
    expect(invoicePdfPathBelongsToOrg('org-a', 'org-a/job-invoices/letterhead.pdf')).toBe(true)
  })

  it('rejects another org prefix', () => {
    expect(invoicePdfPathBelongsToOrg('org-a', 'org-b/job-invoices/letterhead.pdf')).toBe(false)
  })
})

describe('collectPdfAttachments', () => {
  it('does not download a foreign-prefixed path', async () => {
    const download = vi.fn()
    mockInvoiceAdmin(download)
    const attachments = await collectPdfAttachments(
      'org-a',
      null,
      'org-b/job-invoices/secret.pdf'
    )
    expect(attachments).toEqual([])
    expect(download).not.toHaveBeenCalled()
  })
})

describe('createAndSendInvoice path guard', () => {
  beforeEach(() => {
    mockSendEmail.mockResolvedValue({ sent: true, message: 'ok' })
  })

  it('does not download a foreign-prefixed pdfStoragePath', async () => {
    const download = vi.fn()
    mockInvoiceAdmin(download)

    await createAndSendInvoice({
      orgId: 'org-a',
      createdBy: 'user-1',
      leadId: 'lead-1',
      customerName: 'Jane',
      customerEmail: 'jane@example.com',
      totalAmount: 180,
      pdfStoragePath: 'org-b/job-invoices/secret.pdf',
    })

    expect(download).not.toHaveBeenCalled()
    expect(mockSendEmail).toHaveBeenCalled()
  })
})
