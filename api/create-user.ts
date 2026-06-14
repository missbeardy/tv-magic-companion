import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

interface InviteResponse {
  id?: string;
  email?: string;
  msg?: string;
  message?: string;
  error?: string;
  code?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Log everything to Vercel logs
  console.log('=== CREATE USER API CALLED ===');
  console.log('Method:', req.method);
  console.log('Body:', req.body);
  console.log('SUPABASE_URL exists:', !!SUPABASE_URL);
  console.log('SUPABASE_ANON_KEY exists:', !!SUPABASE_ANON_KEY);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, fullName, role, orgId } = req.body;

  if (!email || !fullName || !role || !orgId) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      received: { email: !!email, fullName: !!fullName, role: !!role, orgId: !!orgId }
    });
  }

  // Check environment variables
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing env vars: URL=', !!SUPABASE_URL, 'ANON_KEY=', !!SUPABASE_ANON_KEY);
    return res.status(500).json({ 
      error: 'Server configuration error', 
      details: 'Missing Supabase environment variables'
    });
  }

  try {
    const inviteUrl = `${SUPABASE_URL}/auth/v1/invite`;
    console.log('Calling invite URL:', inviteUrl);

    const response = await fetch(inviteUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email,
        data: {
          full_name: fullName,
          role: role,
          org_id: orgId,
        },
        redirect_to: 'https://tv-magic-companion.vercel.app/login',
      }),
    });

    console.log('Invite response status:', response.status);
    const data: InviteResponse = await response.json();
    console.log('Invite response data:', data);

    if (!response.ok) {
      const errorMsg = data.msg || data.message || data.error || JSON.stringify(data);
      return res.status(response.status).json({ 
        error: 'Invite failed', 
        details: errorMsg
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: `Invitation sent to ${email}!` 
    });

  } catch (err: any) {
    console.error('Caught error:', err);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: err.message 
    });
  }
}