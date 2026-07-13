// api/create-user.ts
// Also routes platform-simulate-inbound (Hobby 12-function limit — see vercel.json).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import './_lib/loadLocalEnv.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : undefined;
  if (action === 'simulate-inbound') {
    const { handlePlatformSimulateInbound } = await import('./_lib/platformSimulateInbound.js');
    return handlePlatformSimulateInbound(req, res);
  }

  if (action === 'set-test-profile') {
    const { handleSetTestProfile } = await import('./_lib/platformSetTestProfile.js');
    return handleSetTestProfile(req, res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseAdmin || !supabaseUrl || !serviceRoleKey) {
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

  if (!['manager', 'platform_admin'].includes(callerProfile.role)) {
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

  // ── Step 3b: Restrict which role can be granted (privilege escalation) ─
  // Managers can only create 'employee'. Only a platform_admin can mint
  // 'manager' or 'platform_admin' accounts.
  const ALLOWED_ROLES = ['employee', 'manager', 'platform_admin'];
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const isPlatformAdmin = callerProfile.role === 'platform_admin';
  if (!isPlatformAdmin && role !== 'employee') {
    return res.status(403).json({
      error: 'Managers can only invite employees. Ask a platform admin to create manager or admin accounts.',
    });
  }

  const redirectUrl = 'https://tv-magic-companion.vercel.app/set-password';

  try {
    const requestBody = {
      email,
      data: { full_name: fullName, role, org_id: orgId },
      redirectTo: redirectUrl,
    };

    const response = await fetch(`${supabaseUrl}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data: any = await response.json();

    if (!response.ok) {
      const details = data.msg || data.message || data.error_description || data.error || 'Unknown error';
      return res.status(response.status).json({ error: 'Invite failed', details });
    }

    const invitedUserId = data.id as string | undefined;
    if (invitedUserId) {
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
        {
          id: invitedUserId,
          email,
          full_name: fullName,
          role,
          org_id: orgId,
        },
        { onConflict: 'id' }
      );
      if (profileError) {
        console.error('Profile upsert after invite failed:', profileError);
        return res.status(500).json({
          error: 'User invited but profile row failed',
          details: profileError.message,
        });
      }
    }

    return res.status(200).json({ success: true, message: `Invitation sent to ${email}!` });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}