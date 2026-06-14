import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

// Interface for the Supabase invite response
interface InviteResponse {
  id?: string;
  email?: string;
  msg?: string;
  message?: string;
  error?: string;
  code?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Authenticate the request
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }

  const token = authHeader.split(' ')[1];
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // 2. Verify manager role and org
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'manager') {
    return res.status(403).json({ error: 'Only managers can invite new team members' });
  }

  const { email, fullName, role, orgId } = req.body;
  if (!email || !fullName || !role || !orgId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (orgId !== profile.org_id) {
    return res.status(403).json({ error: 'Organization mismatch' });
  }

  try {
    // 3. Send invitation via Supabase
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

    const data: InviteResponse = await response.json();

    if (!response.ok) {
      const details = data.msg || data.message || data.error || 'Unknown error';
      return res.status(response.status).json({ error: 'Invite failed', details });
    }

    return res.status(200).json({
      success: true,
      message: `Invitation sent to ${email}!`
    });
  } catch (err: any) {
    console.error('Invite error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}