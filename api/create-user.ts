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
    return res.status(400).json({ 
      error: 'Missing required fields',
      received: { email: !!email, password: !!password, fullName: !!fullName, role: !!role, orgId: !!orgId }
    });
  }

  try {
    console.log('Creating user with:', { email, fullName, role, orgId });

    // Step 1: Create the auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      console.error('Auth create error:', authError);
      return res.status(500).json({ 
        error: 'Auth creation failed', 
        details: authError?.message || 'No user returned' 
      });
    }

    console.log('Auth user created:', authData.user.id);

    // Step 2: Check if profile already exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authData.user.id)
      .single();

    console.log('Existing profile check:', { exists: !!existingProfile, error: checkError });

    // Step 3: Update or insert profile
    let profileError;
    if (existingProfile) {
      // Update existing
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, role, org_id: orgId })
        .eq('id', authData.user.id);
      profileError = error;
    } else {
      // Insert new (shouldn't happen because trigger creates it, but just in case)
      const { error } = await supabase
        .from('profiles')
        .insert({ id: authData.user.id, full_name: fullName, role, org_id: orgId });
      profileError = error;
    }

    if (profileError) {
      console.error('Profile update error:', profileError);
      // Rollback - delete the auth user
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ 
        error: 'Database error updating profile', 
        details: profileError.message,
        hint: profileError.hint,
        code: profileError.code
      });
    }

    console.log('Profile updated successfully');

    return res.status(200).json({ 
      success: true, 
      userId: authData.user.id 
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
}