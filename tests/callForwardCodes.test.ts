import { describe, expect, it } from 'vitest'
import {
  buildCallForwardCodes,
  dialableAuNumber,
  formatAuLineForDisplay,
} from '../shared/callForwardCodes'

describe('call forward codes', () => {
  it('builds the three GSM diverts plus undo, using the domestic number', () => {
    expect(buildCallForwardCodes('+61731234567').map((c) => c.code)).toEqual([
      '**61*0731234567*11*20#',
      '**67*0731234567#',
      '**62*0731234567#',
      '##002#',
    ])
  })

  it('accepts a valid no-answer timer and falls back to 20s otherwise', () => {
    expect(buildCallForwardCodes('0731234567', 15)[0].code).toBe('**61*0731234567*11*15#')
    expect(buildCallForwardCodes('0731234567', 17)[0].code).toBe('**61*0731234567*11*20#')
  })

  it('normalises and formats AU numbers', () => {
    expect(dialableAuNumber('+61 7 3123 4567')).toBe('0731234567')
    expect(formatAuLineForDisplay('+61731234567')).toBe('07 3123 4567')
    expect(formatAuLineForDisplay('+61412345678')).toBe('0412 345 678')
  })
})
