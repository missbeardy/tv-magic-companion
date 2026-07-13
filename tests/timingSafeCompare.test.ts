import { describe, expect, it } from 'vitest'
import { safeCompareSecret } from '../api/_lib/timingSafeCompare'
import { verifyMetaWebhookSignature } from '../api/_lib/metaWebhook'
import { createHmac } from 'crypto'

describe('safeCompareSecret', () => {
  it('returns true for matching secrets', () => {
    expect(safeCompareSecret('abc123', 'abc123')).toBe(true)
  })

  it('returns false for mismatched secrets', () => {
    expect(safeCompareSecret('abc123', 'abc124')).toBe(false)
  })

  it('returns false when either side is missing', () => {
    expect(safeCompareSecret(undefined, 'secret')).toBe(false)
    expect(safeCompareSecret('secret', undefined)).toBe(false)
    expect(safeCompareSecret('', 'secret')).toBe(false)
  })

  it('returns false for different lengths without throwing', () => {
    expect(safeCompareSecret('short', 'much-longer-secret')).toBe(false)
  })
})

describe('verifyMetaWebhookSignature', () => {
  const secret = 'test-app-secret'
  const body = '{"object":"page","entry":[]}'

  function sign(raw: string): string {
    return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
  }

  it('accepts a valid signature', () => {
    expect(verifyMetaWebhookSignature(body, sign(body), secret)).toBe(true)
  })

  it('rejects a tampered body', () => {
    expect(verifyMetaWebhookSignature('{}', sign(body), secret)).toBe(false)
  })

  it('rejects missing or malformed headers', () => {
    expect(verifyMetaWebhookSignature(body, undefined, secret)).toBe(false)
    expect(verifyMetaWebhookSignature(body, 'not-sha256', secret)).toBe(false)
  })
})
