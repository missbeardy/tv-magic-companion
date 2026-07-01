import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  buildEmployeeWhatsAppMessage,
  buildNumberedContentVariables,
  sanitizeWhatsAppVariable,
} from '../api/_lib/employeeWhatsAppTemplates'

describe('employeeWhatsAppTemplates', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    process.env.TWILIO_WHATSAPP_CONTENT_SID_ASSIGNMENT = 'HXassignment123'
    process.env.TWILIO_WHATSAPP_CONTENT_SID_FOLLOW_UP = 'HXfollowup456'
  })

  afterEach(() => {
    process.env = env
  })

  it('sanitizes newlines and empty values', () => {
    expect(sanitizeWhatsAppVariable('  Jane\nSmith  ', 'Unknown')).toBe('Jane Smith')
    expect(sanitizeWhatsAppVariable('', 'Fallback')).toBe('Fallback')
  })

  it('replaces straight apostrophes to avoid Twilio 21656', () => {
    expect(sanitizeWhatsAppVariable("John's TV", 'Unknown')).toBe('John\u2019s TV')
  })

  it('builds numbered ContentVariables for Twilio', () => {
    expect(
      buildNumberedContentVariables(
        ['FieldBourne', 'Jane', 'TV Aerial', 'https://app/leads'],
        ['A', 'B', 'C', 'D']
      )
    ).toEqual({
      '1': 'FieldBourne',
      '2': 'Jane',
      '3': 'TV Aerial',
      '4': 'https://app/leads',
    })
  })

  it('uses fallbacks when values are empty', () => {
    expect(
      buildNumberedContentVariables(['', 'Jane', '', 'https://app/leads'], [
        'Your team',
        'New lead',
        'General enquiry',
        'https://x',
      ])
    ).toEqual({
      '1': 'Your team',
      '2': 'Jane',
      '3': 'General enquiry',
      '4': 'https://app/leads',
    })
  })

  it('uses ContentSid + variables when env is set', () => {
    const payload = buildEmployeeWhatsAppMessage(
      'tech_assignment',
      'fallback plain text',
      {
        orgName: 'FieldBourne',
        leadName: 'Jane',
        serviceType: 'TV Aerial',
        appUrl: 'https://app/leads',
      }
    )

    expect(payload.contentSid).toBe('HXassignment123')
    expect(payload.contentVariables).toEqual({
      '1': 'FieldBourne',
      '2': 'Jane',
      '3': 'TV Aerial',
      '4': 'https://app/leads',
    })
  })

  it('treats STATIC env values case-insensitively', () => {
    process.env.TWILIO_WHATSAPP_ASSIGNMENT_STATIC = 'True'
    const payload = buildEmployeeWhatsAppMessage('tech_assignment', 'fallback', {
      orgName: 'X',
      leadName: 'Y',
      serviceType: 'Z',
      appUrl: 'https://x',
    })
    expect(payload.contentSid).toBe('HXassignment123')
    expect(payload.contentVariables).toBeUndefined()
  })

  it('limits assignment variables when TWILIO_WHATSAPP_ASSIGNMENT_VAR_COUNT is set', () => {
    process.env.TWILIO_WHATSAPP_ASSIGNMENT_VAR_COUNT = '3'
    const payload = buildEmployeeWhatsAppMessage('tech_assignment', 'fallback', {
      orgName: 'FieldBourne',
      leadName: 'Jane',
      serviceType: 'TV Aerial',
      appUrl: 'https://app/leads',
    })
    expect(payload.contentVariables).toEqual({
      '1': 'FieldBourne',
      '2': 'Jane',
      '3': 'TV Aerial',
    })
  })

  it('falls back to Body when ContentSid env is missing', () => {
    delete process.env.TWILIO_WHATSAPP_CONTENT_SID_ASSIGNMENT
    const payload = buildEmployeeWhatsAppMessage('tech_assignment', 'plain body only', {
      orgName: 'X',
      leadName: 'Y',
      serviceType: 'Z',
      appUrl: 'https://x',
    })
    expect(payload.contentSid).toBeUndefined()
    expect(payload.body).toBe('plain body only')
  })
})
