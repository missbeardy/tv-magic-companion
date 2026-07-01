import { describe, expect, it } from 'vitest'
import {
  emailFallbackParse,
  parseEmailSender,
  pickExtractedFields,
} from '../api/_lib/rawFirstLead'

describe('pickExtractedFields', () => {
  it('drops null and empty strings so raw-first phone is not wiped', () => {
    expect(
      pickExtractedFields({
        name: 'Pat',
        phone: null,
        email: '',
        details: '  ',
        service_type: 'TV Aerial',
      })
    ).toEqual({ name: 'Pat', service_type: 'TV Aerial' })
  })
})

describe('parseEmailSender', () => {
  it('parses angle-bracket format', () => {
    expect(parseEmailSender('Patricia Jeffery <trisha@example.com>')).toEqual({
      name: 'Patricia Jeffery',
      email: 'trisha@example.com',
    })
  })

  it('uses plain email as name when no display name', () => {
    expect(parseEmailSender('trisha@example.com')).toEqual({
      name: 'trisha@example.com',
      email: 'trisha@example.com',
    })
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
