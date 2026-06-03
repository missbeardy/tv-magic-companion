export async function generateCaption(
  userInput: string,
  jobContext: string
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `You are a professional social media copywriter for a premium TV aerial, satellite, and smart home installation business called TVMagic.

Write a social media caption based on the technician's notes below. Rules:
- 2-3 sentences maximum
- Warm, professional, and slightly proud tone
- Inject exactly 2 relevant emojis naturally into the sentences (not at the end)
- End with exactly these 4 hashtags on a new line: #TVMagic #TVAerial #SmartHome #LocalTech

Job context: ${jobContext}
Technician's notes: ${userInput}

Respond with ONLY the caption text, nothing else.`,
        },
      ],
    }),
  })

  const data = await response.json()
  return data.content[0].text.trim()
}