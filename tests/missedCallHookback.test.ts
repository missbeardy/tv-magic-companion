import { describe, expect, it } from 'vitest'
import {
  buildMissedCallHookbackMessage,
  MISSED_CALL_HOOKBACK_FALLBACK,
} from '../src/lib/missedCallHookback'

describe('buildMissedCallHookbackMessage', () => {
  it('uses default template with org name and customer fallback', () => {
    const message = buildMissedCallHookbackMessage('TVMagic Sydney')
    expect(message).toContain('TVMagic Sydney')
    expect(message).toContain('there')
    expect(message).toContain('technicians')
  })

  it('interpolates customer name when provided', () => {
    const message = buildMissedCallHookbackMessage('TVMagic Sydney', 'Jane')
    expect(message).toContain('Jane')
    expect(message).not.toContain('there')
  })

  it('uses brand template override when supplied', () => {
    const message = buildMissedCallHookbackMessage(
      'TVMagic',
      'Bob',
      'Hi {{customerName}} from {{org.name}}'
    )
    expect(message).toBe('Hi Bob from TVMagic')
  })

  it('matches approved fallback copy', () => {
    expect(MISSED_CALL_HOOKBACK_FALLBACK).toContain('hands full on-site')
    expect(MISSED_CALL_HOOKBACK_FALLBACK).toContain('assigned to one of our technicians')
  })
})
