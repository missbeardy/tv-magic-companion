import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import type { MessageStructureObject } from 'imapflow'
import { getVoicemailMailboxConfig, pickVoicemailParts } from '../api/_lib/voicemailMailbox'

/**
 * Shape reported by Gmail's IMAP server for a 3CX voicemail: multipart/mixed with a
 * text/plain body and a base64 WAV. Taken from the real message headers
 * (Content-Type: multipart/mixed; boundary=aead2a5a...).
 */
const THREE_CX_STRUCTURE: MessageStructureObject = {
  type: 'multipart/mixed',
  childNodes: [
    {
      part: '1',
      type: 'text/plain',
      parameters: { charset: 'utf-8' },
      encoding: 'quoted-printable',
      size: 220,
    },
    {
      part: '2',
      type: 'audio/wav',
      parameters: { name: 'vmail_0400000000_166_20260727015014.wav' },
      dispositionParameters: { filename: 'vmail_0400000000_166_20260727015014.wav' },
      disposition: 'attachment',
      encoding: 'base64',
      size: 425646,
    },
  ],
}

describe('pickVoicemailParts', () => {
  it('finds the text body and the WAV attachment', () => {
    const { textPart, audioPart } = pickVoicemailParts(THREE_CX_STRUCTURE)

    expect(textPart?.part).toBe('1')
    expect(audioPart?.part).toBe('2')
    expect(audioPart?.type).toBe('audio/wav')
  })

  it('recognises the attachment by filename when the server reports a generic type', () => {
    const generic: MessageStructureObject = {
      type: 'multipart/mixed',
      childNodes: [
        { part: '1', type: 'text/plain' },
        {
          part: '2',
          type: 'application/octet-stream',
          dispositionParameters: { filename: 'vmail_0400000000_166.wav' },
        },
      ],
    }

    expect(pickVoicemailParts(generic).audioPart?.part).toBe('2')
  })

  it('walks nested multiparts rather than only the top level', () => {
    const nested: MessageStructureObject = {
      type: 'multipart/mixed',
      childNodes: [
        {
          type: 'multipart/alternative',
          childNodes: [
            { part: '1.1', type: 'text/plain' },
            { part: '1.2', type: 'text/html' },
          ],
        },
        { part: '2', type: 'audio/wav', dispositionParameters: { filename: 'vm.wav' } },
      ],
    }

    const { textPart, audioPart } = pickVoicemailParts(nested)
    expect(textPart?.part).toBe('1.1')
    expect(audioPart?.part).toBe('2')
  })

  it('returns nothing for a message with no audio', () => {
    const noAudio: MessageStructureObject = {
      type: 'multipart/mixed',
      childNodes: [
        { part: '1', type: 'text/plain' },
        { part: '2', type: 'image/png', dispositionParameters: { filename: 'icon.png' } },
      ],
    }

    expect(pickVoicemailParts(noAudio).audioPart).toBeUndefined()
  })
})

describe('getVoicemailMailboxConfig', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.VOICEMAIL_IMAP_HOST
    delete process.env.VOICEMAIL_IMAP_USER
    delete process.env.VOICEMAIL_IMAP_APP_PASSWORD
    delete process.env.VOICEMAIL_IMAP_FOLDER
  })

  afterEach(() => {
    process.env = env
  })

  it('returns null when credentials are absent, so the poller stays off', () => {
    expect(getVoicemailMailboxConfig()).toBeNull()

    process.env.VOICEMAIL_IMAP_HOST = 'imap.gmail.com'
    process.env.VOICEMAIL_IMAP_USER = 'ops@example.com'
    expect(getVoicemailMailboxConfig()).toBeNull()
  })

  it('defaults to the label the ops mailbox already applies', () => {
    process.env.VOICEMAIL_IMAP_HOST = 'imap.gmail.com'
    process.env.VOICEMAIL_IMAP_USER = 'ops@example.com'
    process.env.VOICEMAIL_IMAP_APP_PASSWORD = 'app-password'

    expect(getVoicemailMailboxConfig()).toEqual({
      host: 'imap.gmail.com',
      user: 'ops@example.com',
      password: 'app-password',
      // Nested Gmail label: the IMAP path uses the display name, not the URL slug.
      folder: 'TVMagic Sales Lead/VoiceMail Lead',
    })
  })

  it('allows the folder to be overridden', () => {
    process.env.VOICEMAIL_IMAP_HOST = 'imap.gmail.com'
    process.env.VOICEMAIL_IMAP_USER = 'ops@example.com'
    process.env.VOICEMAIL_IMAP_APP_PASSWORD = 'app-password'
    process.env.VOICEMAIL_IMAP_FOLDER = 'Parent/Child'

    expect(getVoicemailMailboxConfig()?.folder).toBe('Parent/Child')
  })
})
