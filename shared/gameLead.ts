/**
 * "TV Magic: First Job" marketing game → Companion lead. The game's own
 * serverless function forwards this payload (server to server, shared secret),
 * so the browser never sees the Companion URL.
 */
export const GAME_LEAD_SOURCE = 'first-job-game'
export const GAME_LEAD_LEAD_SOURCE = 'First Job game'

const MAX_FEEDBACK = 10
const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term'] as const

export interface GameLeadFeedback {
  id: string
  question: string
  answer: string
}

export interface GameLeadInput {
  name: string
  /** Normalised national format, 04xxxxxxxx. */
  mobile: string
  suburb: string
  jobNeeded: string
  discountCode: string
  consent: { agreed: true; text: string; at: string }
  feedback: GameLeadFeedback[]
  meta: {
    puzzleSeconds: number | null
    wrongAttempts: number | null
    utm: Partial<Record<(typeof UTM_KEYS)[number], string>>
  }
  /** End-user IP as seen by the game's function; used only for rate limiting. */
  clientIp: string | null
}

export type ParseGameLeadResult =
  | { ok: true; data: GameLeadInput }
  | { ok: false; error: string; honeypot?: true }

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function smallInt(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.round(value)
  return n >= 0 && n <= max ? n : null
}

/** Accepts "0412 345 678", "+61412345678", "61412345678", "412345678"; returns 04xxxxxxxx or null. */
export function normaliseAuMobile(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  const national = digits.startsWith('61') ? `0${digits.slice(2)}` : digits.startsWith('4') ? `0${digits}` : digits
  return /^04\d{8}$/.test(national) ? national : null
}

/** Maps the game's customer-facing job list onto the Companion's service types. */
export function serviceTypeForGameJob(jobNeeded: string): string {
  const job = jobNeeded.toLowerCase()
  if (job.includes('antenna')) return 'TV Aerial'
  if (job.includes('reception') || job.includes('tuning')) return 'Reception Repair'
  if (job.includes('point')) return 'TV Points'
  if (job.includes('wall') || job.includes('mount')) return 'Wall Mounting'
  if (job.includes('theatre') || job.includes('theater')) return 'Home Theatre'
  return 'General Enquiry'
}

export function buildGameLeadDetails(data: GameLeadInput): string {
  const lines = [
    'First Job game lead',
    `Job needed: ${data.jobNeeded}`,
    `Suburb: ${data.suburb}`,
    `Discount code claimed: ${data.discountCode}`,
  ]
  for (const item of data.feedback) {
    lines.push(`${item.question} ${item.answer}`)
  }
  if (data.meta.puzzleSeconds != null) {
    const wrong = data.meta.wrongAttempts ?? 0
    lines.push(`Cable puzzle: ${data.meta.puzzleSeconds}s, ${wrong} wrong ${wrong === 1 ? 'try' : 'tries'}`)
  }
  const utm = UTM_KEYS.filter((key) => data.meta.utm[key]).map((key) => `${key}=${data.meta.utm[key]}`)
  if (utm.length > 0) lines.push(`UTM: ${utm.join(', ')}`)
  lines.push(`Privacy consent given ${data.consent.at}`)
  return lines.join('\n')
}

export function parseGameLeadBody(body: unknown): ParseGameLeadResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' }
  }
  const input = body as Record<string, unknown>
  if (str(input.website, 200)) {
    return { ok: false, error: 'Invalid submission', honeypot: true }
  }
  if (input.source !== GAME_LEAD_SOURCE) return { ok: false, error: 'source is invalid' }

  const name = str(input.name, 120)
  const suburb = str(input.suburb, 120)
  const jobNeeded = str(input.jobNeeded, 80)
  const discountCode = str(input.discountCode, 40)
  if (!name) return { ok: false, error: 'name is required' }
  if (!suburb) return { ok: false, error: 'suburb is required' }
  if (!jobNeeded) return { ok: false, error: 'jobNeeded is required' }

  const mobile = normaliseAuMobile(str(input.mobile, 32))
  if (!mobile) return { ok: false, error: 'Enter an Australian mobile number' }

  const consent = record(input.consent)
  const consentText = str(consent.text, 500)
  const consentAt = str(consent.at, 40)
  if (consent.agreed !== true || !consentText || Number.isNaN(Date.parse(consentAt))) {
    return { ok: false, error: 'consent is required' }
  }

  const feedback: GameLeadFeedback[] = []
  if (Array.isArray(input.feedback)) {
    for (const raw of input.feedback.slice(0, MAX_FEEDBACK)) {
      const item = record(raw)
      const id = str(item.id, 40)
      const question = str(item.question, 200)
      const answer = str(item.answer, 120)
      if (id && question && answer) feedback.push({ id, question, answer })
    }
  }

  const meta = record(input.meta)
  const utmRaw = record(meta.utm)
  const utm: GameLeadInput['meta']['utm'] = {}
  for (const key of UTM_KEYS) {
    const value = str(utmRaw[key], 100)
    if (value) utm[key] = value
  }

  return {
    ok: true,
    data: {
      name,
      mobile,
      suburb,
      jobNeeded,
      discountCode,
      consent: { agreed: true, text: consentText, at: consentAt },
      feedback,
      meta: {
        puzzleSeconds: smallInt(meta.puzzleSeconds, 3600),
        wrongAttempts: smallInt(meta.wrongAttempts, 1000),
        utm,
      },
      clientIp: str(input.clientIp, 100) || null,
    },
  }
}
