import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  emailFallbackParse,
  extractFromEmail,
  extractFromSms,
  extractFromVoicemailTranscript,
  smsFallbackParse,
} from '../api/_lib/extractLead'
import { findAuPhoneInText, phonesEqual } from '../api/_lib/phone'

const GATEWAY = '+61480437390'

describe('findAuPhoneInText', () => {
  it('finds labelled Contact Phone', () => {
    expect(findAuPhoneInText('Contact Phone: 0413 365 044\nYour Email: a@b.com')).toContain('0413')
  })

  it('finds bare AU mobile at start of free text', () => {
    expect(findAuPhoneInText('0459514799 Julie\n\nVictoria Point')).toBe('0459514799')
  })

  it('finds +61 mobile and ignores Sent from my iPhone', () => {
    const text =
      '+61429442538\n\nGood evening,\nI’m inquiring about a TV.\nKind regards,\nFrancesca\nSent from my iPhone'
    expect(findAuPhoneInText(text)).toContain('61429442538')
  })

  it('returns null when no phone present', () => {
    expect(findAuPhoneInText('Can you message? I am at work.')).toBeNull()
  })
})

describe('phonesEqual', () => {
  it('treats national and E.164 as equal', () => {
    expect(phonesEqual('0413365044', '+61413365044')).toBe(true)
    expect(phonesEqual('0413365044', '+61480437390')).toBe(false)
  })
})

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

  it('prefers Contact Phone over gateway From', () => {
    const result = smsFallbackParse(
      'Your Name: Hemraj Joshi\n\nContact Phone: 0413365044\n\nSubject: Starlink\n\nMessage: Fix cable',
      GATEWAY
    )
    expect(result.phone).toBe('0413365044')
    expect(result.name).toBe('Hemraj Joshi')
  })

  it('extracts bare mobile from free-text enquiry, not gateway From', () => {
    const result = smsFallbackParse('0459514799 Julie\n\nVictoria Point ', GATEWAY)
    expect(result.phone).toBe('0459514799')
  })

  it('extracts phone buried in free-text body', () => {
    const result = smsFallbackParse(
      'Gary\n\n45 double jump road Redland bay\n\n0407119821\n\nStarlink installation plus wi fi extender',
      GATEWAY
    )
    expect(result.phone).toBe('0407119821')
  })

  it('extracts +61 phone and ignores Sent from my iPhone footer', () => {
    const result = smsFallbackParse(
      '+61429442538\n\nGood evening,\nI’m inquiring about a potential fix on my TV.\nKind regards,\nFrancesca Hudson\nSent from my iPhone',
      GATEWAY
    )
    expect(result.phone).toMatch(/61429442538/)
    expect(result.phone).not.toBe(GATEWAY)
  })

  it('extracts phone from name/phone/suburb style message', () => {
    const result = smsFallbackParse(
      'Marnie Flaherty\n0466251790\nFlagstone\n50 inch tv wall mount for bedroom',
      GATEWAY
    )
    expect(result.phone).toBe('0466251790')
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

  it('extractFromSms fallback prefers body phone over From when no API key', async () => {
    const result = await extractFromSms('0422889813 lead', GATEWAY)
    expect(result.status).toBe('fallback')
    expect(result.fields.phone).toBe('0422889813')
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
