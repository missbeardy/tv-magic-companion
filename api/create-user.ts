import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface ManagementAPIResponse {
  id: string;
  email: string;
  msg?: string;
  message?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, fullName, role, orgId } = req.body;

  if (!email || !password || !fullName || !role || !orgId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Use Supabase Management API to create user
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: role,
          org_id: orgId,
        },
      }),
    });

    const data = await response.json() as ManagementAPIResponse;

    if (!response.ok) {
      console.error('Management API error:', data);
      return res.status(500).json({ 
        error: 'Auth creation failed', 
        details: data.msg || data.message || 'Unknown error'
      });
    }

    const userId = data.id;

    // The database trigger will automatically create the profile
    // with the metadata we passed above

    return res.status(200).json({ success: true, userId });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
}