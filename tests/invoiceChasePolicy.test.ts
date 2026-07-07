import { describe, expect, it } from 'vitest'
import {
  CHASE_LADDER_DAYS,
  daysOverdue,
  deriveDueAt,
  firstName,
  formatDueDateEnAu,
  formatInvoiceAmount,
  resolveChaseStage,
} from '../api/_lib/invoiceChasePolicy'

function sentAtDaysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

describe('invoiceChasePolicy', () => {
  it('derives due date 14 days after sent_at', () => {
    const sent = new Date('2026-01-01T10:00:00Z')
    const due = deriveDueAt(sent)
    expect(due.toISOString().slice(0, 10)).toBe('2026-01-15')
  })

  it('computes days overdue from sent_at', () => {
    const sent = sentAtDaysAgo(18) // 4 days past due (14 + 4)
    expect(daysOverdue(sent, new Date())).toBe(4)
  })

  it('returns stage 1 at 4 days overdue with chase_count 0', () => {
    const sent = sentAtDaysAgo(18)
    const due = deriveDueAt(sent)
    const overdue = daysOverdue(sent, new Date())
    expect(overdue).toBeGreaterThanOrEqual(3)
    expect(resolveChaseStage(0, overdue, null, due)).toBe(1)
  })

  it('returns null on immediate re-run after stage 1 (chase_count 1, still under 7 days overdue)', () => {
    const sent = sentAtDaysAgo(18)
    const due = deriveDueAt(sent)
    const overdue = daysOverdue(sent, new Date())
    expect(resolveChaseStage(1, overdue, new Date(), due)).toBeNull()
  })

  it('returns stage 2 at 8 days overdue with chase_count 1', () => {
    const sent = sentAtDaysAgo(22) // 8 days overdue
    const due = deriveDueAt(sent)
    const overdue = daysOverdue(sent, new Date())
    expect(overdue).toBeGreaterThanOrEqual(7)
    expect(resolveChaseStage(1, overdue, new Date(sent.getTime() + 3 * 86_400_000), due)).toBe(2)
  })

  it('blocks stage 2 when last_chased_at is on or after the 7-day boundary', () => {
    const sent = sentAtDaysAgo(22)
    const due = deriveDueAt(sent)
    const overdue = daysOverdue(sent, new Date())
    const boundary = new Date(due.getTime())
    boundary.setDate(boundary.getDate() + CHASE_LADDER_DAYS[1])
    expect(resolveChaseStage(1, overdue, boundary, due)).toBeNull()
  })

  it('returns null when chase_count is at max', () => {
    const sent = sentAtDaysAgo(30)
    const due = deriveDueAt(sent)
    const overdue = daysOverdue(sent, new Date())
    expect(resolveChaseStage(3, overdue, null, due)).toBeNull()
  })

  it('extracts first name from customer name', () => {
    expect(firstName('Jane Smith')).toBe('Jane')
    expect(firstName('')).toBe('there')
  })

  it('formats amount and due date for templates', () => {
    const sent = new Date('2026-03-01T00:00:00Z')
    expect(formatInvoiceAmount(125.5)).toBe('AUD 125.50')
    expect(formatDueDateEnAu(sent)).toMatch(/March/)
  })
})
