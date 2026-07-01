import { describe, expect, it } from 'vitest'
import { computeTwilioSignature } from '../api/_lib/twilioSignature'

describe('computeTwilioSignature', () => {
  it('matches inbound-sms verifyTwilioSignature algorithm', () => {
    const url = 'https://preview.example.com/api/inbound-sms'
    const params = {
      Body: '[SIMULATED TEST] Need TV aerial',
      From: '+61400000000',
      To: '+61412345678',
    }
    const token = 'test-auth-token'
    const sig = computeTwilioSignature(url, params, token)

    const sortedParams = Object.keys(params)
      .sort()
      .map((k) => k + params[k as keyof typeof params])
      .join('')
    expect(sig).toBe(
      require('crypto').createHmac('sha1', token).update(url + sortedParams).digest('base64')
    )
  })
})
