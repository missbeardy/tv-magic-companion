import { supabase } from './supabase'

export async function getAuthHeaders(): Promise<Record<string, string>> {
  let { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    session = refreshed.session
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }

  return headers
}

/** Same as getAuthHeaders but throws if no token — use before billing/API calls. */
export async function requireAuthHeaders(): Promise<Record<string, string>> {
  const headers = await getAuthHeaders()
  if (!headers.Authorization) {
    throw new Error('Session expired — please log out and sign in again.')
  }
  return headers
}
