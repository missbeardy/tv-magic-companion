import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

// TEMPORARY HARDCODED KEY – replace with env var later
const INVITE_API_KEY = 'fieldbournedigital2026';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'];
  console.log('Received API Key:', apiKey);
  console.log('Expected API Key:', INVITE_API_KEY);

  if (!apiKey || apiKey !== INVITE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email, fullName, role, orgId } = req.body;
  if (!email || !fullName || !role || !orgId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email,
        data: { full_name: fullName, role, org_id: orgId },
        redirect_to: 'https://tv-magic-companion.vercel.app/login',
      }),
    });

    const data: any = await response.json();

    if (!response.ok) {
      const details = data.msg || data.message || data.error || 'Unknown error';
      return res.status(response.status).json({ error: 'Invite failed', details });
    }

    return res.status(200).json({
      success: true,
      message: `Invitation sent to ${email}!`,
    });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message,
    });
  }
}