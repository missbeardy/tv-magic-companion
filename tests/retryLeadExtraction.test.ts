import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  canEnrichLeadFromVoicemail,
  runLeadExtractionRetry,
} from '../api/_lib/retryLeadExtraction'

describe('canEnrichLeadFromVoicemail', () => {
  it('returns true for pending, failed, or fallback status', () => {
    expect(canEnrichLeadFromVoicemail({ extraction_status: 'pending', name: 'Pat' })).toBe(true)
    expect(canEnrichLeadFromVoicemail({ extraction_status: 'failed', name: 'Pat' })).toBe(true)
    expect(canEnrichLeadFromVoicemail({ extraction_status: 'fallback', name: 'Pat' })).toBe(true)
  })

  it('returns true when name is Missed Call', () => {
    expect(canEnrichLeadFromVoicemail({ extraction_status: 'succeeded', name: 'Missed Call' })).toBe(
      true
    )
  })

  it('returns false for succeeded extraction with a real name', () => {
    expect(canEnrichLeadFromVoicemail({ extraction_status: 'succeeded', name: 'Pat Smith' })).toBe(
      false
    )
  })
})

describe('runLeadExtractionRetry', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey
    }
  })

  it('parses Twilio raw_sms JSON and uses SMS fallback when Claude unavailable', async () => {
    const result = await runLeadExtractionRetry({
      id: 'lead-1',
      org_id: 'org-1',
      source: 'sms',
      name: 'SMS Enquiry',
      phone: '+61400111222',
      raw_sms: JSON.stringify({
        Body: 'Subject: TV aerial install\nMessage: Need someone this week',
        From: '+61400111222',
      }),
      raw_email: null,
    })

    expect(result.status).toBe('fallback')
    expect(result.fields.service_type).toBe('TV Aerial')
    expect(result.fields.phone).toBe('+61400111222')
  })

  it('returns failed when source has no raw payload', async () => {
    const result = await runLeadExtractionRetry({
      id: 'lead-2',
      org_id: 'org-1',
      source: 'email',
      name: 'Pat',
      email: 'pat@example.com',
      raw_sms: null,
      raw_email: null,
    })

    expect(result.status).toBe('failed')
    expect(result.fields).toEqual({})
  })
})
