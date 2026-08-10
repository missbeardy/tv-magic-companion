import { getAuthHeaders } from './apiAuth'

export async function generateCaption(
  userInput: string,
  jobContext: string
): Promise<string> {
  const headers = await getAuthHeaders()
  const response = await fetch('/api/anthropic?action=generate-caption', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jobContext, notes: userInput }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const message = (errorData as { error?: string }).error ?? `HTTP ${response.status}`
    throw new Error(`Caption generation failed: ${message}`)
  }

  const data = (await response.json()) as { caption?: string }
  if (!data.caption) {
    throw new Error('Unexpected response from caption service')
  }

  return data.caption
}
