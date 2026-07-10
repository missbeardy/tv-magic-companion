import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Catch common dev typo: URL project ref must match the anon key JWT "ref" claim.
if (import.meta.env.DEV) {
  try {
    const payload = JSON.parse(atob(supabaseAnonKey.split('.')[1] ?? ''))
    const keyRef = payload?.ref as string | undefined
    const urlRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (keyRef && urlRef && keyRef !== urlRef) {
      console.error(
        `Supabase URL ref "${urlRef}" does not match anon key ref "${keyRef}". ` +
          'Fix VITE_SUPABASE_URL in .env.local / Vercel — this causes login/profile failures.'
      )
    }
  } catch {
    /* ignore JWT parse errors */
  }
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'x-application-name': 'tv-magic-companion',
    },
  },
})