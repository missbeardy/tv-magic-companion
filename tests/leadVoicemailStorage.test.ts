import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabase: { storage: { from: vi.fn() }, from: vi.fn() },
}))

import {
  formatVoicemailDuration,
  LEAD_VOICEMAILS_BUCKET,
  LEAD_VOICEMAIL_DISPLAY_TTL,
} from '../src/lib/leadVoicemailStorage'

describe('formatVoicemailDuration', () => {
  it('drops the zero hour from the 3CX HH:MM:SS format', () => {
    // The real bounced sample reported Duration:"00:00:26".
    expect(formatVoicemailDuration('00:00:26')).toBe('0:26')
    expect(formatVoicemailDuration('00:01:05')).toBe('1:05')
  })

  it('keeps the hour when there is one', () => {
    expect(formatVoicemailDuration('01:02:03')).toBe('1:02:03')
  })

  it('passes through anything that is not HH:MM:SS', () => {
    expect(formatVoicemailDuration('26s')).toBe('26s')
    expect(formatVoicemailDuration(null)).toBeNull()
  })
})

describe('lead voicemail storage constants', () => {
  it('targets the private bucket with a short-lived signed URL', () => {
    expect(LEAD_VOICEMAILS_BUCKET).toBe('lead-voicemails')
    expect(LEAD_VOICEMAIL_DISPLAY_TTL).toBe(3600)
  })
})
