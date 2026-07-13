import { describe, expect, it } from 'vitest'
import {
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
