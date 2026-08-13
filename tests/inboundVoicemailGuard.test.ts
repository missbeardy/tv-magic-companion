import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { looksLikeVoicemailNotification } from '../api/_lib/processVoicemail'
import { VOICEMAIL_BODY, VOICEMAIL_SUBJECT } from './fixtures/voicemailEmail'

const ROOT = resolve(import.meta.dirname, '..')
const inboundEmailSource = readFileSync(resolve(ROOT, 'api/inbound-email.ts'), 'utf8')

/**
 * A 3CX voicemail notification must never fall through to the email-lead branch.
 *
 * Today that happens when CloudMailin delivers the mail without usable audio; it will
 * happen for EVERY voicemail once the CloudMailin voicemail branch is retired in favour
 * of the poller. Without the guard the result is a junk lead named after the PBX
 * ("3CX Communications System"), with the customer's real details never extracted.
 */
describe('inbound-email voicemail guard', () => {
  it('recognises a 3CX notification body as a voicemail, not an email enquiry', () => {
    expect(looksLikeVoicemailNotification(VOICEMAIL_SUBJECT, VOICEMAIL_BODY)).toBe(true)
  })

  it('does not misclassify a genuine email enquiry as a voicemail', () => {
    const enquiry = 'Hi, my TV aerial blew off in the storm. Can someone come out this week?'
    expect(looksLikeVoicemailNotification('Website enquiry', enquiry)).toBe(false)
  })

  it('guards the email branch before any lead is created', () => {
    // Order matters: the check must sit ahead of resolveOrgIdFromInboundEmail, or a
    // voicemail gets an org, an extraction and a lead before anyone notices.
    const guardAt = inboundEmailSource.indexOf('looksLikeVoicemailNotification(subject, emailText)')
    const emailOrgAt = inboundEmailSource.indexOf('resolveOrgIdFromInboundEmail(supabase, req.body)')

    expect(guardAt).toBeGreaterThan(-1)
    expect(emailOrgAt).toBeGreaterThan(-1)
    expect(guardAt).toBeLessThan(emailOrgAt)
  })

  it('skips rather than errors, so CloudMailin does not retry forever', () => {
    expect(inboundEmailSource).toContain("reason: 'voicemail_without_audio'")
  })
})
