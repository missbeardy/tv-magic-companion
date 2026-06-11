import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from './_rateLimit';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // SEC-08: Rate limiting — 20 requests per minute per IP
  
const rawIp = req.headers['x-forwarded-for']
const ip = Array.isArray(rawIp) ? rawIp[0] : (rawIp ?? 'unknown')
  
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { messages, max_tokens = 1000 } = req.body as {
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages' });
  }

  const clampedTokens = Math.min(max_tokens, 2000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: clampedTokens,
        messages,
      }),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('Anthropic proxy error:', err);
    return res.status(500).json({ error: 'Upstream request failed' });
  }
}
