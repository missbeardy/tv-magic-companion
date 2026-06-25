import { describe, it, expect } from 'vitest'
import { resolveThemeTokens, darkenHex } from '../src/lib/theme'

describe('theme', () => {
  it('org colors override brand defaults', () => {
    const tokens = resolveThemeTokens(
      { name: 'South Brisbane', primary_color: '#ff0000', secondary_color: '#00ff00', logo_url: null },
      { id: '1', name: 'TV Magic', slug: 'tv-magic', vertical: 'x', logo_url: null, primary_color: '#004B93', secondary_color: '#00B4C5', sms_templates: {}, email_templates: {}, ai_config: {}, upsell_items: [], is_active: true }
    )
    expect(tokens.primary).toBe('#ff0000')
    expect(tokens.displayName).toBe('South Brisbane')
  })

  it('falls back to brand when org colors missing', () => {
    const tokens = resolveThemeTokens(
      { name: 'Franchisee', logo_url: null },
      { id: '1', name: 'Brand', slug: 'b', vertical: 'x', logo_url: '/logo.png', primary_color: '#111111', secondary_color: '#222222', sms_templates: {}, email_templates: {}, ai_config: {}, upsell_items: [], is_active: true }
    )
    expect(tokens.primary).toBe('#111111')
    expect(tokens.logoUrl).toBe('/logo.png')
  })

  it('darkens hex colors', () => {
    expect(darkenHex('#004B93')).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
