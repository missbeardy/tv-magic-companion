// api/create-user.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const INVITE_API_KEY = 'fieldbournedigital2026';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== INVITE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email, fullName, role, orgId } = req.body;
  
  // DEBUG: Log what we received
  console.log('>>> DEBUG API: Received body:', req.body);
  console.log('>>> DEBUG API: email:', email, '| fullName:', fullName, '| role:', role, '| orgId:', orgId);
  console.log('>>> DEBUG API: orgId type:', typeof orgId, 'falsy check:', !orgId);

  if (!email || !fullName || !role || !orgId) {
    console.log('>>> DEBUG API: Validation failed - missing fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const redirectUrl = 'https://tv-magic-companion.vercel.app/set-password';
  console.log('>>> DEBUG API: Sending invite to:', email, '| redirectTo:', redirectUrl);

  try {
    const requestBody = {
      email,
      data: { full_name: fullName, role, org_id: orgId },
      redirectTo: redirectUrl,
    };
    console.log('>>> DEBUG API: Supabase request body:', JSON.stringify(requestBody));

    const response = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data: any = await response.json();
    console.log('>>> DEBUG API: Supabase raw response:', JSON.stringify(data));
    console.log('>>> DEBUG API: Supabase response status:', response.status);

    if (!response.ok) {
      const details = data.msg || data.message || data.error_description || data.error || 'Unknown error';
      console.log('>>> DEBUG API: Invite failed with details:', details);
      return res.status(response.status).json({ error: 'Invite failed', details });
    }

    return res.status(200).json({ success: true, message: `Invitation sent to ${email}!` });
  } catch (err: any) {
    console.log('>>> DEBUG API: Caught exception:', err.message);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
