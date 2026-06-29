import { describe, expect, it } from 'vitest'
import {
  buildCloudmailinPlusAddress,
  extractCloudmailinRecipients,
  extractPlusTagsFromRecipients,
  parsePlusTagFromEmailAddress,
} from '../shared/inboundEmailRouting'

describe('parsePlusTagFromEmailAddress', () => {
  it('extracts tag from CloudMailin plus-address', () => {
    expect(parsePlusTagFromEmailAddress('56465431321+clientA@cloudmailin.net')).toBe('clienta')
    expect(parsePlusTagFromEmailAddress('56465431321+tv-magic-sydney@cloudmailin.net')).toBe('tv-magic-sydney')
  })

  it('handles display names and mixed case', () => {
    expect(parsePlusTagFromEmailAddress('FieldBourne <56465431321+ClientB@cloudmailin.net>')).toBe('clientb')
  })

  it('returns null when no plus-tag', () => {
    expect(parsePlusTagFromEmailAddress('56465431321@cloudmailin.net')).toBeNull()
    expect(parsePlusTagFromEmailAddress('not-an-email')).toBeNull()
  })
})

describe('extractCloudmailinRecipients', () => {
  it('reads envelope to and recipients', () => {
    const recipients = extractCloudmailinRecipients({
      envelope: {
        to: '56465431321+org-a@cloudmailin.net',
        recipients: ['56465431321+org-a@cloudmailin.net', 'other@example.com'],
      },
    })
    expect(recipients).toEqual([
      '56465431321+org-a@cloudmailin.net',
      'other@example.com',
    ])
  })

  it('includes headers.to when present', () => {
    const recipients = extractCloudmailinRecipients({
      envelope: { to: '56465431321+tag@cloudmailin.net' },
      headers: { to: 'Admin <admin@fieldbourne.com.au>' },
    })
    expect(recipients).toContain('56465431321+tag@cloudmailin.net')
    expect(recipients).toContain('admin@fieldbourne.com.au')
  })
})

describe('extractPlusTagsFromRecipients', () => {
  it('deduplicates tags', () => {
    expect(
      extractPlusTagsFromRecipients([
        '56465431321+clientA@cloudmailin.net',
        '56465431321+clienta@cloudmailin.net',
      ])
    ).toEqual(['clienta'])
  })
})

describe('buildCloudmailinPlusAddress', () => {
  it('inserts tag before @', () => {
    expect(buildCloudmailinPlusAddress('56465431321@cloudmailin.net', 'tv-magic-sydney')).toBe(
      '56465431321+tv-magic-sydney@cloudmailin.net'
    )
  })

  it('strips existing plus suffix from base', () => {
    expect(buildCloudmailinPlusAddress('56465431321+old@cloudmailin.net', 'new-tag')).toBe(
      '56465431321+new-tag@cloudmailin.net'
    )
  })
})
