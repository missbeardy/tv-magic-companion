import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  buildEmployeeWhatsAppMessage,
  buildNumberedContentVariables,
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

  it('builds numbered ContentVariables for Twilio', () => {
    expect(buildNumberedContentVariables(['FieldBourne', 'Jane', 'TV Aerial', 'https://app/leads'])).toEqual({
      '1': 'FieldBourne',
      '2': 'Jane',
      '3': 'TV Aerial',
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
