import type { SupabaseClient } from '@supabase/supabase-js'
import { MESSENGER_SYSTEM_PROMPT } from './messengerKb.js'
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

export async function interpretMessengerWithClaude(opts: {
  session: MessengerSession
  userText: string
}): Promise<{ reply: string | null; capture: MessengerCapture } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const recent = opts.session.messages
    .slice(-8)
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')

  const prompt = `${MESSENGER_SYSTEM_PROMPT}

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
