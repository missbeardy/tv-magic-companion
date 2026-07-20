import { getAuthHeaders } from './apiAuth'

export async function generateCaption(
  userInput: string,
  jobContext: string
): Promise<string> {
  const headers = await getAuthHeaders()
  const response = await fetch('/api/anthropic', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `You are a professional social media copywriter for a local Australian trade business.

Write a social media caption based on the technician's notes below. Rules:
- 2-3 sentences maximum
- Warm, professional, and slightly proud tone
- Inject exactly 2 relevant emojis naturally into the sentences (not at the end)
- End with exactly 4 relevant hashtags on a new line (trade + local + service, no brand-specific tags unless the job notes name the brand)

Job context: ${jobContext}
Technician's notes: ${userInput}

Respond with ONLY the caption text, nothing else.`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const message = (errorData as { error?: string }).error ?? `HTTP ${response.status}`
    throw new Error(`Caption generation failed: ${message}`)
  }

  const data = await response.json()

  if (!data.content?.[0]?.text) {
    throw new Error('Unexpected response from caption service')
  }

  return data.content[0].text.trim()
}