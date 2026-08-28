import { findAuPhoneInText, isAuMobile } from './phone.js'
import {
  ALREADY_DONE,
  ASK_NAME,
  ASK_NAME_PHONE,
  ASK_SUBURB,
  NO_PHONE_CLOSE,
  SUBURB_WAIT_MS,
  TIMEOUT_CLOSE,
  WITH_SUBURB_CLOSE,
} from './messengerKb.js'

export type MessengerSessionState = 'open' | 'awaiting_suburb' | 'submitted' | 'closed'

export interface MessengerMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface MessengerSession {
  id: string
  org_id: string
  page_id: string
  psid: string
  conversation_id: string
  state: MessengerSessionState
  name: string | null
  phone: string | null
  suburb: string | null
  service_needed: string | null
  out_of_area: boolean
  phone_ask_count: number
  awaiting_suburb_until: string | null
  lead_id: string | null
  messages: MessengerMessage[]
}

export interface MessengerCapture {
  name: string | null
  phone: string | null
  suburb: string | null
  service_needed: string | null
  out_of_area: boolean
}

export interface MessengerTurnResult {
  session: MessengerSession
  replies: string[]
  submit: boolean
}

const OTHER_CITIES =
  /\b(sydney|melbourne|perth|adelaide|hobart|darwin|canberra|newcastle|wollongong|cairns|townsville|toowoomba)\b/i

export function conversationIdForPageUser(pageId: string, psid: string): string {
  return `${pageId}_${psid}`.slice(0, 128)
}

export function sanitizeMessengerReply(text: string): string {
  let out = text.trim()
  out = out.replace(/\$\s*[\d,]+(?:\.\d+)?/g, 'a quote from the technician')
  out = out.replace(/1800[\s-]*tv[\s-]*magic/gi, '0449 947 247')
  out = out.replace(/\b1800[\s-]?\d{3}[\s-]?\d{3}\b/g, '0449 947 247')
  out = out.replace(/\b0?438[\s-]?\d{3}[\s-]?\d{3}\b/g, '0449 947 247')
  return out
}

export function extractCaptureFromText(text: string): MessengerCapture {
  const phoneRaw = findAuPhoneInText(text)
  const phone = phoneRaw && isAuMobile(phoneRaw) ? phoneRaw : null
  const nameMatch = text.match(
    /(?:my name is|name(?:'s| is)|i(?:['’]m| am)(?!\s+in\b))\s+([A-Za-z][A-Za-z'’\-]+(?:\s+[A-Za-z][A-Za-z'’\-]+)?)/i
  )
  let name = nameMatch?.[1]?.trim() ?? null
  if (!name && phone && phoneRaw) {
    const leftover = text
      .replace(phoneRaw, ' ')
      .replace(/[^A-Za-z\s'-]/g, ' ')
      .trim()
    const words = leftover.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'-]{1,30}$/.test(w))
    if (words.length >= 1 && words.length <= 3) name = words.join(' ')
  }
  const suburbMatch = text.match(
    /(?:suburb(?:\s+is)?|i(?:['’]m| am) in|we(?:['’]re| are) in|from)\s+([A-Za-z][A-Za-z\s-]{1,40}?)(?:[.!?,]|$)/i
  )
  const serviceMatch = text.match(
    /\b(wall\s*mount|starlink|antenna|aerial|pixelat|no signal|tv point|sound ?bar|home theatre|home theater|cctv|matv|vast|satellite|foxtel)\b/i
  )
  return {
    name,
    phone,
    suburb: suburbMatch?.[1]?.trim() ?? null,
    service_needed: serviceMatch?.[1]?.trim() ?? null,
    out_of_area: OTHER_CITIES.test(text),
  }
}

export function mergeCapture(session: MessengerSession, capture: MessengerCapture): MessengerSession {
  return {
    ...session,
    name: capture.name || session.name,
    phone: capture.phone || session.phone,
    suburb: capture.suburb || session.suburb,
    service_needed: capture.service_needed || session.service_needed,
    out_of_area: session.out_of_area || capture.out_of_area,
  }
}

export function kbFallbackReply(text: string): string | null {
  const t = text.toLowerCase()
  const ask = ASK_NAME_PHONE
  if (/wall\s*mount|hang(ing)? (the )?tv/.test(t)) {
    return `Yes, we wall-mount TVs. ${ask}`
  }
  if (/starlink/.test(t)) return `Yes, we install Starlink. ${ask}`
  if (/pixelat|no signal|reception|missing channel/.test(t)) {
    return `Yes — that's reception repair / tuning. ${ask}`
  }
  if (/antenna|aerial/.test(t)) return `Yes, we install and repair antennas. ${ask}`
  if (/tv point|extra point/.test(t)) return `Yes, we can put in extra TV points. ${ask}`
  if (/price|how much|call[- ]?out|quote/.test(t)) {
    return `A technician has to see the job before quoting — they'll cover that on the call. ${ask}`
  }
  return null
}

function hasNameAndMobile(session: MessengerSession): boolean {
  return Boolean(session.name?.trim() && session.phone && isAuMobile(session.phone))
}

/** Pure state machine for one customer message. */
export function reduceMessengerTurn(
  session: MessengerSession,
  userText: string,
  nowMs: number,
  capture: MessengerCapture,
  conversationalReply: string | null
): MessengerTurnResult {
  if (session.state === 'submitted' || session.state === 'closed') {
    return { session, replies: [ALREADY_DONE], submit: false }
  }

  let next = mergeCapture(session, capture)

  if (next.state === 'awaiting_suburb' && !next.suburb) {
    const guess = userText.trim().slice(0, 80)
    if (guess) next = { ...next, suburb: guess }
  }

  if (!next.phone || !isAuMobile(next.phone)) {
    const lastAssistant = session.messages.filter((m) => m.role === 'assistant').at(-1)?.text ?? ''
    const alreadyAsked = /mobile|phone|number/.test(lastAssistant)
    const asks = alreadyAsked ? next.phone_ask_count + 1 : next.phone_ask_count
    next = { ...next, phone_ask_count: asks }
    if (asks >= 2) {
      next = { ...next, state: 'closed', awaiting_suburb_until: null }
      return { session: next, replies: [NO_PHONE_CLOSE], submit: false }
    }
    const reply = sanitizeMessengerReply(conversationalReply || kbFallbackReply(userText) || ASK_NAME_PHONE)
    return { session: next, replies: [reply], submit: false }
  }

  if (!next.name?.trim()) {
    const reply = sanitizeMessengerReply(conversationalReply || ASK_NAME)
    return { session: next, replies: [reply], submit: false }
  }

  if (next.suburb) {
    next = { ...next, state: 'submitted', awaiting_suburb_until: null }
    return { session: next, replies: [WITH_SUBURB_CLOSE], submit: true }
  }

  next = {
    ...next,
    state: 'awaiting_suburb',
    awaiting_suburb_until: new Date(nowMs + SUBURB_WAIT_MS).toISOString(),
  }
  return { session: next, replies: [ASK_SUBURB], submit: false }
}

export function reduceSuburbTimeout(session: MessengerSession): MessengerTurnResult {
  if (session.state !== 'awaiting_suburb') {
    return { session, replies: [], submit: false }
  }
  if (!hasNameAndMobile(session)) {
    return {
      session: { ...session, state: 'closed', awaiting_suburb_until: null },
      replies: [],
      submit: false,
    }
  }
  return {
    session: { ...session, state: 'submitted', awaiting_suburb_until: null },
    replies: [TIMEOUT_CLOSE],
    submit: true,
  }
}

export function appendMessages(
  session: MessengerSession,
  userText: string,
  replies: string[]
): MessengerSession {
  const extra: MessengerMessage[] = [
    { role: 'user', text: userText },
    ...replies.map((text) => ({ role: 'assistant' as const, text })),
  ]
  return { ...session, messages: [...session.messages, ...extra].slice(-16) }
}
