import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  emailFallbackParse,
  extractFromEmail,
  extractFromSms,
  extractFromVoicemailTranscript,
  smsFallbackParse,
} from '../api/_lib/extractLead'

describe('smsFallbackParse', () => {
  it('uses from number and structured Subject/Message fields', () => {
    const result = smsFallbackParse(
      'Subject: TV aerial install\nMessage: Need someone this week',
      '+61400111222'
    )
    expect(result.name).toBe('SMS Enquiry')
    expect(result.phone).toBe('+61400111222')
    expect(result.service_type).toBe('TV Aerial')
    expect(result.details).toContain('aerial')
  })
})

describe('emailFallbackParse', () => {
  it('extracts phone and service type from body', () => {
    const result = emailFallbackParse(
      'Need a TV aerial repair.\nPhone: 0402 448 924\nAddress: 298 Wights Mountain Rd',
      'Insurance inspection',
      'Pat <pat@example.com>'
    )
    expect(result.name).toBe('Pat')
    expect(result.email).toBe('pat@example.com')
    expect(result.phone).toContain('0402')
    expect(result.service_type).toBe('TV Aerial')
    expect(result.address).toBeTruthy()
  })

  it('falls back to subject for details when body empty', () => {
    const result = emailFallbackParse('', 'Urgent satellite install', 'bob@test.com')
    expect(result.details).toBe('Urgent satellite install')
    expect(result.service_type).toBe('Satellite Dish')
  })
})

describe('ExtractionRunResult', () => {
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

  it('extractFromSms returns fallback status without API key', async () => {
    const result = await extractFromSms('Need a TV aerial', '+61400000000')
    expect(result.status).toBe('fallback')
    expect(result.fields.phone).toBe('+61400000000')
  })

  it('extractFromEmail returns fallback status without API key', async () => {
    const result = await extractFromEmail(
      'Need satellite dish install',
      'Enquiry',
      'bob@test.com'
    )
    expect(result.status).toBe('fallback')
    expect(result.fields.service_type).toBe('Satellite Dish')
  })

  it('extractFromVoicemailTranscript returns failed when Claude unavailable', async () => {
    const result = await extractFromVoicemailTranscript(
      'Hi this is Pat calling about a TV aerial',
      'Voicemail',
      '+61400000000'
    )
    expect(result.status).toBe('failed')
    expect(result.fields).toEqual({})
  })
})
