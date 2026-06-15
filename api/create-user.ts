// api/create-user.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

// These must exist in Vercel env vars (NOT VITE_ prefixed — those are frontend only)
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Simple shared secret between this API and the frontend modal
const INVITE_API_KEY = 'fieldbournedigital2026';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify the shared secret from the frontend
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== INVITE_API_KEY) {
    console.log('Auth failed — received key:', apiKey);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email, fullName, role, orgId } = req.body;
  if (!email || !fullName || !role || !orgId) {
    return res.status(400).json({ error: 'Missing required fields: email, fullName, role, orgId' });
  }

  // Safety check — make sure env vars loaded correctly
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase env vars', { SUPABASE_URL: !!SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY });
    return res.status(500).json({ error: 'Server misconfiguration — missing env vars' });
  }

  try {
    // The /auth/v1/invite endpoint requires the service_role key — NOT the anon key
    // The service_role key has admin privileges to create users
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
        redirect_to: 'https://tv-magic-companion.vercel.app/login',
      }),
    });

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