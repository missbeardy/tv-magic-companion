import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, fullName, role, orgId } = req.body;

  if (!email || !password || !fullName || !role || !orgId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Create the user via admin API
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      console.error('Auth create error:', authError);
      return res.status(500).json({ error: authError?.message || 'Failed to create user' });
    }

    // Update the profile with role and org_id
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: fullName, role, org_id: orgId })
      .eq('id', authData.user.id);

    if (profileError) {
      // Rollback – delete the auth user
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: profileError.message });
    }

    return res.status(200).json({ success: true, userId: authData.user.id });
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}