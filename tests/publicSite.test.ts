import { describe, expect, it } from 'vitest'
import { isPublicSitePath } from '../src/lib/publicSite'

describe('isPublicSitePath', () => {
  it('treats the legal pages as customer pages', () => {
    expect(isPublicSitePath('/privacy')).toBe(true)
    expect(isPublicSitePath('/terms')).toBe(true)
    expect(isPublicSitePath('/delete-account')).toBe(true)
  })

  it('does not treat staff routes as customer pages', () => {
    expect(isPublicSitePath('/')).toBe(false)
    expect(isPublicSitePath('/leads')).toBe(false)
    expect(isPublicSitePath('/login')).toBe(false)
    expect(isPublicSitePath('/calendar')).toBe(false)
  })
})
