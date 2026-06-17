// api/anthropic.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Inlined rate limiter (no shared imports — ESM/Vercel fix)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Anthropic API Key is missing in environment variables');
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

    if (!response.ok) {
      console.error('Anthropic API Error Details:', data);
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Anthropic proxy failed to fetch:', (err as Error).message);
    return res.status(502).json({
      error: 'Upstream connection failed',
      details: (err as Error).message,
    });
  }
}