import { afterEach, describe, expect, it, vi } from 'vitest'
import { missingMobileMessageEnv, missingServerEnv } from '../api/_lib/env'

const ALL_VARS = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  TWILIO_AUTH_TOKEN: 'twilio-token',
  INBOUND_SECRET: 'inbound-secret',
  CRON_SECRET: 'cron-secret',
  META_APP_SECRET: 'meta-secret',
  RESEND_API_KEY: 'resend-key',
} as const

describe('missingServerEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is empty when every required var is set', () => {
    for (const [key, value] of Object.entries(ALL_VARS)) vi.stubEnv(key, value)
    vi.stubEnv('VITE_SUPABASE_URL', '')

    expect(missingServerEnv()).toEqual([])
  })

  it('accepts VITE_SUPABASE_URL as a stand-in for SUPABASE_URL', () => {
    for (const [key, value] of Object.entries(ALL_VARS)) vi.stubEnv(key, value)
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')

    expect(missingServerEnv()).toEqual([])
  })

  it('lists every unset var by name', () => {
    for (const key of Object.keys(ALL_VARS)) vi.stubEnv(key, '')
    vi.stubEnv('VITE_SUPABASE_URL', '')

    expect(missingServerEnv().sort()).toEqual(
      [
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'TWILIO_AUTH_TOKEN',
        'INBOUND_SECRET',
        'CRON_SECRET',
        'META_APP_SECRET',
        'RESEND_API_KEY',
      ].sort()
    )
  })

  it('treats a whitespace-only value as unset', () => {
    for (const [key, value] of Object.entries(ALL_VARS)) vi.stubEnv(key, value)
    vi.stubEnv('RESEND_API_KEY', '   ')

    expect(missingServerEnv()).toEqual(['RESEND_API_KEY'])
  })
})

describe('missingMobileMessageEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('lists unset Mobile Message vars, which are not in the always-required list', () => {
    vi.stubEnv('MOBILE_MESSAGE_API_USERNAME', 'user')
    vi.stubEnv('MOBILE_MESSAGE_API_PASSWORD', '  ')
    vi.stubEnv('MOBILE_MESSAGE_WEBHOOK_SECRET', '')
    expect(missingMobileMessageEnv()).toEqual([
      'MOBILE_MESSAGE_API_PASSWORD',
      'MOBILE_MESSAGE_WEBHOOK_SECRET',
    ])
    expect(missingServerEnv()).not.toContain('MOBILE_MESSAGE_WEBHOOK_SECRET')
  })
})
