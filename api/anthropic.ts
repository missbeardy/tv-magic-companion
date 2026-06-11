import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Ensure we only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('Anthropic handler started');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Anthropic API Key is missing');
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { messages, max_tokens = 1000 } = req.body as {
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages' });
  }

  const clampedTokens = Math.min(max_tokens, 2000);

  try {
    console.log('Fetching from Anthropic API...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: clampedTokens,
        messages,
      }),
    });

    console.log(`Anthropic response status: ${response.status}`);

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API Error Details:', data);
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Anthropic proxy caught an exception:', err);
    return res.status(500).json({ error: 'Upstream request failed' });
  }
}
