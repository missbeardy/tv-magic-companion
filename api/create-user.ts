// api/create-user.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  // ── Step 1: Verify the caller is actually logged in ──────────────────
  // The client now sends their real Supabase session token instead of a
  // hardcoded "API key" anyone could copy out of the browser bundle.
  const authHeader = req.headers['authorization'];
  const accessToken = typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : '';

  if (!accessToken) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // ── Step 2: Confirm the caller is a manager, and look up their org ───
  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, org_id')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !callerProfile) {
    return res.status(403).json({ error: 'Caller profile not found' });
  }

  if (callerProfile.role !== 'manager') {
    return res.status(403).json({ error: 'Only managers can invite team members' });
  }

  const { email, fullName, role, orgId } = req.body;

  if (!email || !fullName || !role || !orgId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // ── Step 3: A manager can only invite people into THEIR OWN org ──────
  // This is the line that closes the cross-org exploit.
  if (orgId !== callerProfile.org_id) {
    return res.status(403).json({ error: 'You can only invite team members into your own organisation' });
  }

  const redirectUrl = 'https://tv-magic-companion.vercel.app/set-password';

  try {
    const requestBody = {
      email,
      data: { full_name: fullName, role, org_id: orgId },
      redirectTo: redirectUrl,
    };

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

    if (!response.ok) {
      const details = data.msg || data.message || data.error_description || data.error || 'Unknown error';
      return res.status(response.status).json({ error: 'Invite failed', details });
    }

    return res.status(200).json({ success: true, message: `Invitation sent to ${email}!` });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}