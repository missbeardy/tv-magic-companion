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
  if (!email || !fullName || !role || !orgId) {
    return res.status(400).json({ error: 'Missing required fields: email, fullName, role, orgId' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase env vars');
    return res.status(500).json({ error: 'Server misconfiguration — missing env vars' });
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email,
        data: { full_name: fullName, role, org_id: orgId },
        redirectTo: 'https://tv-magic-companion.vercel.app/set-password', // ← was redirect_to
          }),
      
    });

    const payload = {
    email,
    data: { full_name: fullName, role, org_id: orgId },
    redirectTo: 'https://tv-magic-companion.vercel.app/set-password',
};
    console.log("DEBUG PAYLOAD:", JSON.stringify(payload));

    const data: any = await response.json();

    if (!response.ok) {
      const details = data.msg || data.message || data.error_description || data.error || 'Unknown Supabase error';
      console.error('Supabase invite failed:', response.status, details);
      return res.status(response.status).json({ error: 'Invite failed', details });
    }

    return res.status(200).json({
      success: true,
      message: `Invitation sent to ${email}!`,
    });
  } catch (err: any) {
    console.error('Unexpected error in create-user:', err);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message,
    });
  }
}