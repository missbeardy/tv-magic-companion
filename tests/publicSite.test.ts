import { describe, expect, it } from 'vitest'
import { isPublicSitePath } from '../src/lib/publicSite'

describe('isPublicSitePath', () => {
  it('treats the wall visualiser as a customer page', () => {
    expect(isPublicSitePath('/visualise')).toBe(true)
  })

  it('treats quote and invoice tokens as customer pages', () => {
    expect(isPublicSitePath('/quote/abc')).toBe(true)
    expect(isPublicSitePath('/invoice/abc')).toBe(true)
  })

  it('does not treat staff routes as customer pages', () => {
    expect(isPublicSitePath('/')).toBe(false)
    expect(isPublicSitePath('/leads')).toBe(false)
    expect(isPublicSitePath('/login')).toBe(false)
    expect(isPublicSitePath('/calendar')).toBe(false)
    expect(isPublicSitePath('/quotes')).toBe(false)
  })
})
