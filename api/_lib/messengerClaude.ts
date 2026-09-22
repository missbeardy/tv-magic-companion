import type { SupabaseClient } from '@supabase/supabase-js'
import type { MessengerOrgConfig } from './messengerKb.js'
import type { MessengerCapture, MessengerSession } from './messengerTurn.js'
import { extractCaptureFromText } from './messengerTurn.js'

interface ClaudeCaptureJson {
  reply?: unknown
  name?: unknown
  phone?: unknown
  suburb?: unknown
  service_needed?: unknown
  out_of_area?: unknown
}

function asTrimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.toLowerCase() !== 'null' ? trimmed : null
}

/**
 * Loads the org config the Messenger prompt is built from. Returns null when
 * `messenger_contact_phone` isn't set — the caller must fail closed in that
 * case (skip the AI, log to unrouted_inbound) rather than run without a
 * number the bot is allowed to give out.
 */
export async function loadOrgMessengerConfig(
  supabase: SupabaseClient,
  orgId: string
): Promise<MessengerOrgConfig | null> {
  const { data: org } = await supabase
    .from('orgs')
    .select('name, messenger_business_name, messenger_contact_phone, service_area_note, ai_context, service_types, timezone')
    .eq('id', orgId)
    .maybeSingle()

  const contactPhone =
    typeof org?.messenger_contact_phone === 'string' ? org.messenger_contact_phone.trim() : ''
  if (!contactPhone) return null

  const businessName =
    (typeof org?.messenger_business_name === 'string' && org.messenger_business_name.trim()) ||
    (typeof org?.name === 'string' && org.name.trim()) ||
    'the business'

  return {
    businessName,
    contactPhone,
    timezone: (typeof org?.timezone === 'string' && org.timezone.trim()) || 'Australia/Brisbane',
    serviceTypes: Array.isArray(org?.service_types) ? (org.service_types as string[]) : [],
    serviceAreaNote:
      typeof org?.service_area_note === 'string' ? org.service_area_note.trim() || null : null,
    aiContext: typeof org?.ai_context === 'string' ? org.ai_context.trim() || null : null,
  }
}

export async function interpretMessengerWithClaude(opts: {
  session: MessengerSession
  userText: string
  systemPrompt?: string | null
}): Promise<{ reply: string | null; capture: MessengerCapture } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const systemPrompt = opts.systemPrompt?.trim()
  if (!systemPrompt) {
    console.error('[MESSENGER_PROMPT_MISSING]', { orgId: opts.session.org_id })
    return null
  }

  const recent = opts.session.messages
    .slice(-8)
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')

  const prompt = `${systemPrompt}

Known so far:
- name: ${opts.session.name ?? 'none'}
- phone: ${opts.session.phone ?? 'none'}
- suburb: ${opts.session.suburb ?? 'none'}
- service: ${opts.session.service_needed ?? 'none'}
- state: ${opts.session.state}

Recent turns:
${recent || '(none)'}

Customer just said:
${opts.userText.slice(0, 1500)}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    console.error('Messenger Claude error', res.status)
    return null
  }

  const result = (await res.json()) as { content: Array<{ type: string; text: string }> }
  const raw = result.content[0]?.type === 'text' ? result.content[0].text : ''
  const clean = raw.replace(/```json|```/g, '').trim()
  try {
    const parsed = JSON.parse(clean) as ClaudeCaptureJson
    const regex = extractCaptureFromText(opts.userText)
    return {
      reply: asTrimmed(parsed.reply),
      capture: {
        name: asTrimmed(parsed.name) || regex.name,
        phone: asTrimmed(parsed.phone) || regex.phone,
        suburb: asTrimmed(parsed.suburb) || regex.suburb,
        service_needed: asTrimmed(parsed.service_needed) || regex.service_needed,
        out_of_area: parsed.out_of_area === true || regex.out_of_area,
      },
    }
  } catch {
    return null
  }
}
