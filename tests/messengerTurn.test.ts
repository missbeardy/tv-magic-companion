import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ASK_SUBURB, NO_PHONE_CLOSE, TIMEOUT_CLOSE, WITH_SUBURB_CLOSE } from '../api/_lib/messengerKb'
import {
  extractCaptureFromText,
  kbFallbackReply,
  reduceMessengerTurn,
  reduceSuburbTimeout,
  sanitizeMessengerReply,
  type MessengerCapture,
  type MessengerSession,
} from '../api/_lib/messengerTurn'

const emptyCapture: MessengerCapture = {
  name: null,
  phone: null,
  suburb: null,
  service_needed: null,
  out_of_area: false,
}

function session(over: Partial<MessengerSession> = {}): MessengerSession {
  return {
    id: 's1',
    org_id: 'org-1',
    page_id: 'page-1',
    psid: 'psid-1',
    conversation_id: 'page-1_psid-1',
    state: 'open',
    name: null,
    phone: null,
    suburb: null,
    service_needed: null,
    out_of_area: false,
    phone_ask_count: 0,
    awaiting_suburb_until: null,
    lead_id: null,
    messages: [],
    ...over,
  }
}

describe('extractCaptureFromText', () => {
  it('pulls name and mobile from a short intro', () => {
    const cap = extractCaptureFromText("I'm Jane 0412 345 678")
    expect(cap.name).toBe('Jane')
    expect(cap.phone).toContain('0412')
  })

  it('does not treat "I\'m in Annerley" as a name', () => {
    const cap = extractCaptureFromText("I'm in Annerley")
    expect(cap.name).toBeNull()
    expect(cap.suburb).toBe('Annerley')
  })

  it('ignores landlines for the required mobile', () => {
    expect(extractCaptureFromText('Call me on 07 3000 0000').phone).toBeNull()
  })
})

describe('sanitizeMessengerReply', () => {
  it('strips prices and other-franchise numbers', () => {
    const out = sanitizeMessengerReply('It is $150 or call 1800 123 456 or 0438 777 656')
    expect(out).not.toMatch(/\$\s*150/)
    expect(out).toContain('0449 947 247')
    expect(out).not.toContain('1800 123 456')
  })
})

describe('kbFallbackReply', () => {
  it('answers wall mount without quoting a price', () => {
    const reply = kbFallbackReply('Do you wall mount TVs?')
    expect(reply).toMatch(/wall-mount/i)
    expect(reply).not.toMatch(/\$/)
  })
})

describe('reduceMessengerTurn', () => {
  it('does not submit without a mobile', () => {
    const result = reduceMessengerTurn(
      session({ name: 'Jane' }),
      'hi',
      Date.now(),
      emptyCapture,
      null
    )
    expect(result.submit).toBe(false)
    expect(result.replies[0]).toMatch(/mobile/i)
  })

  it('gives 0449 947 247 after two phone asks', () => {
    const first = reduceMessengerTurn(session(), 'hi', Date.now(), emptyCapture, null)
    const second = reduceMessengerTurn(
      { ...first.session, messages: [{ role: 'assistant', text: first.replies[0] }] },
      'no',
      Date.now(),
      emptyCapture,
      null
    )
    expect(second.submit).toBe(false)
    const third = reduceMessengerTurn(
      { ...second.session, messages: [{ role: 'assistant', text: second.replies[0] }] },
      'still no',
      Date.now(),
      emptyCapture,
      null
    )
    expect(third.replies[0]).toBe(NO_PHONE_CLOSE)
    expect(third.submit).toBe(false)
    expect(third.session.state).toBe('closed')
  })

  it('asks suburb when name and mobile are in and suburb is missing', () => {
    const cap = extractCaptureFromText('Jane 0412345678')
    const result = reduceMessengerTurn(session(), 'Jane 0412345678', Date.now(), cap, null)
    expect(result.submit).toBe(false)
    expect(result.replies[0]).toBe(ASK_SUBURB)
    expect(result.session.state).toBe('awaiting_suburb')
    expect(result.session.awaiting_suburb_until).toBeTruthy()
  })

  it('submits with suburb when they already gave it', () => {
    const cap = extractCaptureFromText("I'm Jane 0412345678 from Annerley")
    const result = reduceMessengerTurn(
      session(),
      "I'm Jane 0412345678 from Annerley",
      Date.now(),
      cap,
      null
    )
    expect(result.submit).toBe(true)
    expect(result.replies[0]).toBe(WITH_SUBURB_CLOSE)
    expect(result.session.suburb).toBe('Annerley')
  })

  it('treats the wait reply as suburb and submits once', () => {
    const waiting = session({
      state: 'awaiting_suburb',
      name: 'Jane',
      phone: '0412345678',
      awaiting_suburb_until: new Date(Date.now() + 60_000).toISOString(),
    })
    const result = reduceMessengerTurn(waiting, 'Annerley', Date.now(), emptyCapture, null)
    expect(result.submit).toBe(true)
    expect(result.session.suburb).toBe('Annerley')
    expect(result.replies[0]).toBe(WITH_SUBURB_CLOSE)
  })

  it('does not submit twice after the lead is in', () => {
    const result = reduceMessengerTurn(
      session({ state: 'submitted', name: 'Jane', phone: '0412345678', suburb: 'Annerley' }),
      'hello again',
      Date.now(),
      emptyCapture,
      null
    )
    expect(result.submit).toBe(false)
  })
})

describe('reduceSuburbTimeout', () => {
  it('submits without suburb when name and mobile are present', () => {
    const result = reduceSuburbTimeout(
      session({
        state: 'awaiting_suburb',
        name: 'Jane',
        phone: '0412345678',
        awaiting_suburb_until: new Date(0).toISOString(),
      })
    )
    expect(result.submit).toBe(true)
    expect(result.replies[0]).toBe(TIMEOUT_CLOSE)
    expect(result.session.suburb).toBeNull()
  })

  it('does not submit if the mobile is missing', () => {
    const result = reduceSuburbTimeout(
      session({ state: 'awaiting_suburb', name: 'Jane', phone: null })
    )
    expect(result.submit).toBe(false)
  })
})

describe('knowledge pack', () => {
  it('still forbids prices and other franchise numbers', () => {
    const identity = readFileSync(
      join(process.cwd(), 'docs/kb/tvmagic-south-brisbane/identity-and-rules.md'),
      'utf8'
    )
    expect(identity).toContain('0449 947 247')
    expect(identity).toMatch(/Never quote a price/i)
  })
})
