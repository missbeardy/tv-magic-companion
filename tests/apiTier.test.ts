import { describe, it, expect } from 'vitest'
import { buildBrandTransferPayload } from '../src/lib/brandTransfer'

describe('brand transfer', () => {
  it('copies brand colors and upsells onto org payload', () => {
    const payload = buildBrandTransferPayload({
      id: 'brand-1',
      primary_color: '#111111',
      secondary_color: '#222222',
      upsell_items: [{ id: '1', label: 'Check signal' }],
    })
    expect(payload.brand_id).toBe('brand-1')
    expect(payload.primary_color).toBe('#111111')
    expect(payload.upsell_items).toHaveLength(1)
  })
})
