import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

interface InviteResponse {
  id?: string;
  email?: string;
  msg?: string;
  message?: string;
  error?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, fullName, role, orgId } = req.body;

  if (!email || !fullName || !role || !orgId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Send invitation email
    const response = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
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

    const data: InviteResponse = await response.json();

    if (!response.ok) {
      console.error('Invite error:', data);
      return res.status(500).json({ 
        error: 'Invite failed', 
        details: data.msg || data.message || data.error || 'Unknown error'
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: `Invitation sent to ${email}! They will receive an email to set their password.`
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
}